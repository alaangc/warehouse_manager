import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import type { AppDatabase } from '../../db/database.js';
import type { UserTable } from '../../db/types.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { HttpProblem } from '../../http/problem-handler.js';
import {
  assertUserRouteChange,
  hashUserPassword,
  userAuditSnapshot,
  userChangeEffects,
} from './user-domain.js';

export type AdministrationContext = { actorId: string; requestId: string };
export interface CreateUserInput {
  username: string;
  displayName: string;
  role: 'ADMINISTRATOR' | 'DRIVER';
  password: string;
}
export interface UpdateUserInput {
  expectedVersion: number;
  displayName?: string | undefined;
  role?: 'ADMINISTRATOR' | 'DRIVER' | undefined;
  password?: string | undefined;
  active?: boolean | undefined;
  reason?: string | undefined;
}
export function userResource(row: Selectable<UserTable>) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
    version: row.version,
  };
}
export function requireVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new HttpProblem(
      409,
      'OPTIMISTIC_CONFLICT',
      'Conflict',
      'Reload the record before saving.',
    );
}
const cursorKey = randomBytes(32);
const Cursor = z.object({ id: z.uuid(), createdAt: z.iso.datetime(), scope: z.string() }).strict();
export class UserAdminService {
  constructor(private readonly database: AppDatabase) {}
  async get(id: string) {
    const row = await this.database
      .selectFrom('app_user')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new HttpProblem(404, 'RESOURCE_NOT_FOUND', 'Not Found');
    return userResource(row);
  }
  async list(
    input: {
      search?: string | undefined;
      active?: boolean | undefined;
      limit: number;
      cursor?: string | undefined;
    },
    actorId: string,
  ) {
    const scope = JSON.stringify([
      actorId,
      input.search?.trim().toLowerCase() ?? '',
      input.active ?? null,
    ]);
    let query = this.database
      .selectFrom('app_user')
      .selectAll()
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(input.limit + 1);
    const search = input.search?.trim();
    if (search)
      query = query.where((eb) =>
        eb.or([
          eb('username', 'ilike', `%${search}%`),
          eb('display_name', 'ilike', `%${search}%`),
        ]),
      );
    if (input.active !== undefined) query = query.where('active', '=', input.active);
    if (input.cursor) {
      try {
        const [payload, signature] = input.cursor.split('.');
        if (!payload || !signature) throw new Error('Cursor missing');
        const expected = createHmac('sha256', cursorKey).update(payload).digest();
        const received = Buffer.from(signature, 'base64url');
        if (received.length !== expected.length || !timingSafeEqual(received, expected))
          throw new Error('Invalid cursor signature');
        const decoded = Cursor.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
        if (decoded.scope !== scope) throw new Error('Cursor scope changed');
        query = query.where((eb) =>
          eb.or([
            eb('created_at', '<', new Date(decoded.createdAt)),
            eb.and([eb('created_at', '=', new Date(decoded.createdAt)), eb('id', '<', decoded.id)]),
          ]),
        );
      } catch {
        throw new HttpProblem(
          422,
          'CURSOR_INVALID',
          'Validation Failed',
          'Restart the search; the cursor is invalid.',
        );
      }
    }
    const rows = await query.execute();
    const data = rows.slice(0, input.limit);
    const last = data.at(-1);
    let nextCursor: string | null = null;
    if (rows.length > input.limit && last) {
      const payload = Buffer.from(
        JSON.stringify({ id: last.id, createdAt: last.created_at.toISOString(), scope }),
      ).toString('base64url');
      nextCursor = `${payload}.${createHmac('sha256', cursorKey).update(payload).digest('base64url')}`;
    }
    return { data: data.map(userResource), page: { nextCursor, hasMore: nextCursor !== null } };
  }
  async create(input: CreateUserInput, context: AdministrationContext) {
    const hash = await hashUserPassword(input.password);
    return runSerializable(this.database, async (transaction) => {
      const row = await transaction
        .insertInto('app_user')
        .values({
          id: crypto.randomUUID(),
          username: input.username.trim().toLowerCase(),
          display_name: input.displayName.trim(),
          password_hash: hash,
          role: input.role,
          active: true,
          archived_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const result = userResource(row);
      await new AuditWriter().write(transaction, {
        ...context,
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: row.id,
        after: userAuditSnapshot(result),
      });
      return result;
    });
  }
  async update(id: string, input: UpdateUserInput, context: AdministrationContext) {
    const passwordHash =
      input.password === undefined ? undefined : await hashUserPassword(input.password);
    return runSerializable(this.database, async (transaction) => {
      const before = await transaction
        .selectFrom('app_user')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!before) throw new HttpProblem(404, 'RESOURCE_NOT_FOUND', 'Not Found');
      requireVersion(before.version, input.expectedVersion);
      const candidate = {
        ...userResource(before),
        displayName: input.displayName?.trim() ?? before.display_name,
        active: input.active ?? before.active,
        role: input.role ?? before.role,
        version: before.version + 1,
      };
      if (before.active && !candidate.active && !input.reason?.trim())
        throw new HttpProblem(
          422,
          'ARCHIVE_REASON_REQUIRED',
          'Validation Failed',
          'A reason is required to deactivate a user.',
        );
      const routes = await transaction
        .selectFrom('route')
        .select('state')
        .where('driver_id', '=', id)
        .where('state', '!=', 'CLOSED')
        .execute();
      assertUserRouteChange(
        userResource(before),
        candidate,
        routes.map((route) => route.state),
      );
      const effects = userChangeEffects(
        userResource(before),
        candidate,
        passwordHash !== undefined,
      );
      const now = new Date();
      const after = await transaction
        .updateTable('app_user')
        .set({
          display_name: candidate.displayName,
          role: candidate.role,
          active: candidate.active,
          archived_at: candidate.active ? null : now,
          password_hash: passwordHash ?? before.password_hash,
          updated_at: now,
          version: candidate.version,
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      if (effects.revokeSessions)
        await transaction
          .updateTable('auth_session')
          .set({ revoked_at: now, revoked_reason: effects.action })
          .where('user_id', '=', id)
          .where('revoked_at', 'is', null)
          .execute();
      await new AuditWriter().write(transaction, {
        ...context,
        action: effects.action,
        entityType: 'USER',
        entityId: id,
        ...(input.reason ? { reason: input.reason } : {}),
        before: userAuditSnapshot(userResource(before)),
        after: userAuditSnapshot(userResource(after)),
      });
      return userResource(after);
    });
  }
}

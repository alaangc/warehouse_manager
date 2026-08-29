import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AppDatabase } from '../db/database.js';

export const SESSION_COOKIE = '__Host-wm_session';
export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 12 * 60 * 60 * 1000,
};

export type SessionPrincipal = {
  id: string;
  username: string;
  displayName: string;
  role: 'ADMINISTRATOR' | 'DRIVER';
  active: boolean;
};

export type CreatedSession = { id: string; csrfToken: string; principal: SessionPrincipal };

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function secretsMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export class SessionStore {
  constructor(private readonly database: AppDatabase) {}

  async create(principal: SessionPrincipal): Promise<CreatedSession> {
    const id = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.database
      .insertInto('auth_session')
      .values({
        id: digest(id),
        user_id: principal.id,
        csrf_secret_hash: digest(csrfToken),
        data: { username: principal.username },
        created_at: now,
        last_seen_at: now,
        idle_expires_at: new Date(now.getTime() + 30 * 60_000),
        absolute_expires_at: new Date(now.getTime() + 12 * 60 * 60_000),
        revoked_at: null,
        revoked_reason: null,
      })
      .execute();
    return { id, csrfToken, principal };
  }

  async find(id: string): Promise<(CreatedSession & { csrfHash: string }) | null> {
    const now = new Date();
    const row = await this.database
      .selectFrom('auth_session as session')
      .innerJoin('app_user as user', 'user.id', 'session.user_id')
      .select([
        'session.csrf_secret_hash',
        'session.idle_expires_at',
        'session.absolute_expires_at',
        'session.revoked_at',
        'user.id',
        'user.username',
        'user.display_name',
        'user.role',
        'user.active',
      ])
      .where('session.id', '=', digest(id))
      .executeTakeFirst();
    if (
      !row ||
      row.revoked_at ||
      !row.active ||
      new Date(row.idle_expires_at) <= now ||
      new Date(row.absolute_expires_at) <= now
    )
      return null;
    await this.database
      .updateTable('auth_session')
      .set({ last_seen_at: now, idle_expires_at: new Date(now.getTime() + 30 * 60_000) })
      .where('id', '=', digest(id))
      .execute();
    return {
      id,
      csrfToken: '',
      csrfHash: row.csrf_secret_hash,
      principal: {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        active: row.active,
      },
    };
  }

  matchesCsrf(hash: string, token: string): boolean {
    // Login returns the original token. Session restoration returns its persisted digest,
    // which is itself an opaque synchronizer token and keeps the original secret unrecoverable.
    return secretsMatch(hash, token) || secretsMatch(hash, digest(token));
  }

  async revoke(id: string, reason = 'LOGOUT'): Promise<void> {
    await this.database
      .updateTable('auth_session')
      .set({ revoked_at: new Date(), revoked_reason: reason })
      .where('id', '=', digest(id))
      .execute();
  }
}

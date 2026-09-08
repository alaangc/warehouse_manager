import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { administrationHarness } from '../../support/administration-harness.js';
import { UserAdminService } from '../../../src/modules/users/user-admin-service.js';

let harness: Awaited<ReturnType<typeof administrationHarness>>;
let adminId: string;
const context = () => ({ actorId: adminId, requestId: crypto.randomUUID() });
beforeAll(async () => {
  harness = await administrationHarness();
  adminId = (await harness.login('admin')).id;
});
afterEach(async () => {
  if (!harness) return;
  await sql`drop trigger if exists reject_service_audit on audit_event; drop function if exists reject_service_audit()`.execute(
    harness.database,
  );
});
afterAll(async () => {
  await harness?.close();
});
async function rejectAudit() {
  await sql`create function reject_service_audit() returns trigger language plpgsql as $$ begin raise exception 'service audit failure'; end $$;
    create trigger reject_service_audit before insert on audit_event for each row execute function reject_service_audit()`.execute(
    harness.database,
  );
}
it('creates, paginates, rotates passwords, and revokes old sessions with atomic audits', async () => {
  const service = new UserAdminService(harness.database);
  const input = {
    username: `user-${crypto.randomUUID()}`,
    displayName: 'Service Driver',
    role: 'DRIVER' as const,
    password: 'development-password-change-me',
  };
  const user = await service.create(input, context());
  const session = await harness.login(input.username);
  const before = await service.list({ limit: 1 }, adminId);
  expect(before.page.nextCursor).toBeTruthy();
  const second = await service.list({ limit: 1, cursor: before.page.nextCursor! }, adminId);
  expect(second.data[0]?.id).not.toBe(before.data[0]?.id);
  await expect(
    service.list({ limit: 1, cursor: before.page.nextCursor!, search: 'changed' }, adminId),
  ).rejects.toMatchObject({ code: 'CURSOR_INVALID' });
  await service.update(
    user.id,
    { expectedVersion: user.version, password: 'rotated-service-password' },
    context(),
  );
  expect((await harness.send(session, 'get', '/auth/session')).status).toBe(401);
  expect((await harness.login(input.username, 'rotated-service-password')).id).toBe(user.id);
  const audit = await harness.database
    .selectFrom('audit_event')
    .selectAll()
    .where('entity_id', '=', user.id)
    .execute();
  expect(audit).toHaveLength(2);
  expect(JSON.stringify(audit)).not.toContain('password');
});
it('rolls back user changes and sessions when auditing fails', async () => {
  const service = new UserAdminService(harness.database);
  const user = await service.create(
    {
      username: `rollback-${crypto.randomUUID()}`,
      displayName: 'Rollback',
      role: 'DRIVER',
      password: 'development-password-change-me',
    },
    context(),
  );
  const session = await harness.login(user.username);
  await rejectAudit();
  await expect(
    service.update(
      user.id,
      { expectedVersion: user.version, active: false, reason: 'Retired' },
      context(),
    ),
  ).rejects.toThrow('service audit failure');
  expect(await service.get(user.id)).toEqual(user);
  expect((await harness.send(session, 'get', '/auth/session')).status).toBe(200);
});

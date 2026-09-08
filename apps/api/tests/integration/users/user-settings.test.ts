import argon2 from 'argon2';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  administrationHarness,
  testPrinterProfile,
  type TestPrincipal,
} from '../../support/administration-harness.js';
import {
  createEnRouteFixture,
  createSaleScenario,
  saleCommand,
} from '../../support/sales-factories.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { RouteLoadService } from '../../../src/modules/routes/route-load-service.js';

const password = 'development-password-change-me';
const rotatedPassword = 'rotated-integration-password';
const settingId = '00000000-0000-4000-8000-000000000001';
const reason = 'Administration integration verification';
type ConfigurationTable =
  'app_user' | 'business_setting' | 'printer_profile' | 'user_printer_preference';
type Snapshot = { row: Record<string, unknown>; transactionId: string };

// T106 is deliberately red until T109–T114 implement administration. Fixtures use
// existing migrations and real authentication; missing routes must fail assertions,
// never module imports, mocked repositories, or expected-failure test markers.
describe('user and settings transactions in PostgreSQL 18', () => {
  let harness: Awaited<ReturnType<typeof administrationHarness>>;
  let admin: TestPrincipal;
  let seededPasswordHash: string;

  beforeAll(async () => {
    harness = await administrationHarness();
    admin = await harness.login('admin');
    seededPasswordHash = (await userRow(admin.id)).password_hash;
  });

  afterEach(async () => {
    if (!harness) return;
    await sql`drop trigger if exists test_reject_administration_audit on audit_event`.execute(
      harness.database,
    );
    await sql`drop function if exists test_reject_administration_audit_write()`.execute(
      harness.database,
    );
    await sql`drop sequence if exists test_administration_audit_attempts`.execute(harness.database);
  });

  afterAll(async () => {
    await harness?.close();
  });

  function userRow(id: string) {
    return harness.database
      .selectFrom('app_user')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  }

  async function userFixture(active = true) {
    return harness.database
      .insertInto('app_user')
      .values({
        id: crypto.randomUUID(),
        username: `administration-${crypto.randomUUID()}`,
        display_name: 'Integration Driver',
        password_hash: seededPasswordHash,
        role: 'DRIVER',
        active,
        archived_at: active ? null : new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async function snapshot(table: ConfigurationTable, id: string): Promise<Snapshot | undefined> {
    const key = table === 'user_printer_preference' ? 'user_id' : 'id';
    const result = await sql<Snapshot>`
      select to_jsonb(t) as row, xmin::text as "transactionId"
      from ${sql.table(table)} t where ${sql.ref(key)} = ${id}::uuid
    `.execute(harness.database);
    return result.rows[0];
  }

  async function audits(entityId: string) {
    return harness.database
      .selectFrom('audit_event')
      .selectAll()
      .where('entity_id', '=', entityId)
      .orderBy('id')
      .execute();
  }

  async function expectAudit(
    table: ConfigurationTable,
    id: string,
    actorId: string,
    action: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
  ) {
    const persisted = await snapshot(table, id);
    expect(persisted).toBeDefined();
    const result = await sql<{
      actor_id: string;
      action: string;
      entity_type: string;
      before_values: Record<string, unknown> | null;
      after_values: Record<string, unknown>;
      request_id: string;
      occurred_at: Date;
      transactionId: string;
    }>`select *, xmin::text as "transactionId" from audit_event
       where entity_id = ${id}::uuid and xmin::text = ${persisted!.transactionId}`.execute(
      harness.database,
    );
    // Matching PostgreSQL transaction IDs proves the audit and mutation committed together.
    const event = result.rows.find((row) => row.action === action);
    expect(event).toBeDefined();
    expect(event).toMatchObject({
      actor_id: actorId,
      action,
      transactionId: persisted!.transactionId,
    });
    expect(event!.entity_type).toEqual(expect.any(String));
    expect(event!.request_id).toEqual(expect.any(String));
    expect(event!.occurred_at).toBeInstanceOf(Date);
    if (before === null) expect(event!.before_values).toBeNull();
    else expect(event!.before_values).toMatchObject(before);
    expect(event!.after_values).toMatchObject(after);
    const serialized = JSON.stringify([event!.before_values, event!.after_values]);
    expect(serialized).not.toMatch(/password|csrf|session|token|secret|device_handle/i);
    expect(serialized).not.toContain(seededPasswordHash);
    expect(serialized).not.toContain(rotatedPassword);
  }

  async function rejectAuditWrites() {
    // A sequence survives rollback, so an unrelated HTTP 500 cannot satisfy the test.
    await sql`
      create sequence test_administration_audit_attempts;
      create function test_reject_administration_audit_write() returns trigger language plpgsql as $$
      begin
        perform nextval('test_administration_audit_attempts');
        raise exception 'injected administration audit failure';
      end $$;
      create trigger test_reject_administration_audit before insert on audit_event
      for each row execute function test_reject_administration_audit_write()
    `.execute(harness.database);
  }

  async function expectAuditFailure(status: number) {
    expect(status).toBe(500);
    const result = await sql<{
      is_called: boolean;
    }>`select is_called from test_administration_audit_attempts`.execute(harness.database);
    expect(result.rows[0]?.is_called).toBe(true);
  }

  async function printerFixture() {
    const input = { ...testPrinterProfile, name: `Printer ${crypto.randomUUID()}` };
    const response = await harness.send(admin, 'post', '/printer-profiles', input);
    expect(response.status).toBe(201);
    return {
      input,
      id: response.body.data.id as string,
      version: response.body.data.version as number,
    };
  }

  const changes = [
    {
      name: 'display name',
      patch: { displayName: 'Renamed Driver' },
      after: { displayName: 'Renamed Driver' },
      revoke: false,
    },
    { name: 'deactivation', patch: { active: false }, after: { active: false }, revoke: true },
    {
      name: 'role',
      patch: { role: 'ADMINISTRATOR' },
      after: { role: 'ADMINISTRATOR' },
      revoke: true,
    },
    {
      name: 'password',
      patch: { password: rotatedPassword },
      after: { active: true },
      revoke: true,
    },
    { name: 'activation', patch: { active: true }, after: { active: true }, revoke: false },
  ] as const;

  it('creates an Argon2id user with a safe audit in the same transaction', async () => {
    const input = {
      username: `created-${crypto.randomUUID()}`,
      displayName: 'Created Driver',
      role: 'DRIVER',
      password,
    };
    const response = await harness.send(admin, 'post', '/users', input);
    expect(response.status).toBe(201);
    const row = await userRow(response.body.data.id);
    expect(row).toMatchObject({
      username: input.username,
      display_name: input.displayName,
      role: 'DRIVER',
      active: true,
      version: 1,
    });
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(row.password_hash, password)).toBe(true);
    await expectAudit('app_user', row.id, admin.id, 'USER_CREATED', null, {
      id: row.id,
      username: input.username,
      role: 'DRIVER',
    });
  });

  it.each(changes)(
    'persists $name and audits it atomically with the required session effects',
    async (change) => {
      const user = await userFixture(change.name !== 'activation');
      const sessions = user.active
        ? [await harness.login(user.username), await harness.login(user.username)]
        : [];
      const response = await harness.send(admin, 'patch', `/users/${user.id}`, {
        expectedVersion: user.version,
        reason,
        ...change.patch,
      });
      expect(response.status).toBe(200);
      const row = await userRow(user.id);
      expect(row.version).toBe(user.version + 1);
      expect(response.body.data).toMatchObject(change.after);
      if ('active' in change.patch) expect(row.active).toBe(change.patch.active);
      if ('role' in change.patch) expect(row.role).toBe(change.patch.role);
      if ('displayName' in change.patch) expect(row.display_name).toBe(change.patch.displayName);
      if (change.name === 'password') {
        expect(row.password_hash).not.toBe(user.password_hash);
        expect(await argon2.verify(row.password_hash, rotatedPassword)).toBe(true);
        expect(await argon2.verify(row.password_hash, password)).toBe(false);
      }
      const storedSessions = await harness.database
        .selectFrom('auth_session')
        .select(['revoked_at', 'revoked_reason', sql<string>`xmin::text`.as('transactionId')])
        .where('user_id', '=', user.id)
        .execute();
      expect(storedSessions).toHaveLength(sessions.length);
      for (const session of storedSessions) {
        if (change.revoke) {
          expect(session.revoked_at).toBeInstanceOf(Date);
          expect(session.revoked_reason).toEqual(expect.any(String));
          expect(session.transactionId).toBe((await snapshot('app_user', user.id))!.transactionId);
        } else expect(session.revoked_at).toBeNull();
      }
      for (const session of sessions)
        expect((await harness.send(session, 'get', '/auth/session')).status).toBe(
          change.revoke ? 401 : 200,
        );
      const login = await harness.send(null, 'post', '/auth/login', {
        username: user.username,
        password: change.name === 'password' ? rotatedPassword : password,
      });
      expect(login.status).toBe(change.name === 'deactivation' ? 401 : 200);
      await expectAudit(
        'app_user',
        user.id,
        admin.id,
        change.name === 'deactivation' ? 'USER_DEACTIVATED' : 'USER_UPDATED',
        { id: user.id, active: user.active, role: user.role, displayName: user.display_name },
        change.after,
      );
    },
  );

  it('rolls back user creation when its audit fails', async () => {
    const username = `rejected-${crypto.randomUUID()}`;
    const before = await harness.database
      .selectFrom('audit_event')
      .select('id')
      .orderBy('id')
      .execute();
    await rejectAuditWrites();
    await expectAuditFailure(
      (
        await harness.send(admin, 'post', '/users', {
          username,
          displayName: 'Rejected',
          role: 'DRIVER',
          password,
        })
      ).status,
    );
    expect(
      await harness.database
        .selectFrom('app_user')
        .select('id')
        .where('username', '=', username)
        .execute(),
    ).toEqual([]);
    expect(
      await harness.database.selectFrom('audit_event').select('id').orderBy('id').execute(),
    ).toEqual(before);
  });

  it.each(changes)(
    'rolls back $name and session revocation when audit insertion fails',
    async (change) => {
      const user = await userFixture(change.name !== 'activation');
      const sessions = user.active
        ? [await harness.login(user.username), await harness.login(user.username)]
        : [];
      const before = await snapshot('app_user', user.id);
      const beforeSessions = await harness.database
        .selectFrom('auth_session')
        .selectAll()
        .where('user_id', '=', user.id)
        .orderBy('id')
        .execute();
      const beforeAudit = await audits(user.id);
      await rejectAuditWrites();
      await expectAuditFailure(
        (
          await harness.send(admin, 'patch', `/users/${user.id}`, {
            expectedVersion: user.version,
            reason,
            ...change.patch,
          })
        ).status,
      );
      expect(await snapshot('app_user', user.id)).toEqual(before);
      expect(
        await harness.database
          .selectFrom('auth_session')
          .selectAll()
          .where('user_id', '=', user.id)
          .orderBy('id')
          .execute(),
      ).toEqual(beforeSessions);
      expect(await audits(user.id)).toEqual(beforeAudit);
      for (const session of sessions)
        expect((await harness.send(session, 'get', '/auth/session')).status).toBe(200);
    },
  );

  it('rejects a stale user edit without changing data, sessions, or success audits', async () => {
    const user = await userFixture();
    await harness.login(user.username);
    const before = await snapshot('app_user', user.id);
    const beforeSessions = await harness.database
      .selectFrom('auth_session')
      .selectAll()
      .where('user_id', '=', user.id)
      .execute();
    const beforeAudit = await audits(user.id);
    expect(
      (
        await harness.send(admin, 'patch', `/users/${user.id}`, {
          expectedVersion: user.version + 1,
          active: false,
          reason,
        })
      ).status,
    ).toBe(409);
    expect(await snapshot('app_user', user.id)).toEqual(before);
    expect(
      await harness.database
        .selectFrom('auth_session')
        .selectAll()
        .where('user_id', '=', user.id)
        .execute(),
    ).toEqual(beforeSessions);
    expect(await audits(user.id)).toEqual(beforeAudit);
  });

  async function routeFixture(state: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED') {
    const user = await userFixture();
    const fixture = await createEnRouteFixture(harness.database, {
      driverId: user.id,
      createdBy: admin.id,
      originLocationId: '00000000-0000-4000-8000-000000000020',
    });
    // The shared sales factory's UUID code exceeds the HTTP contract's 32 chars.
    const vehicle = await harness.database
      .updateTable('vehicle')
      .set({ code: `V-${crypto.randomUUID().slice(0, 24)}` })
      .where('id', '=', fixture.vehicle.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await harness.database
      .updateTable('route')
      .set({
        state,
        started_at: state === 'PREPARING' ? null : new Date(),
        returned_at: state === 'RETURNED' || state === 'CLOSED' ? new Date() : null,
        closed_at: state === 'CLOSED' ? new Date() : null,
        closed_by: state === 'CLOSED' ? admin.id : null,
      })
      .where('id', '=', fixture.route.id)
      .execute();
    return { ...fixture, vehicle, user };
  }

  describe.each(['PREPARING', 'EN_ROUTE', 'RETURNED'] as const)('%s assignment guards', (state) => {
    it.each([{ active: false }, { role: 'ADMINISTRATOR' }])(
      'rejects assigned Driver change %j without side effects',
      async (patch) => {
        const fixture = await routeFixture(state);
        const principal = await harness.login(fixture.user.username);
        const before = await snapshot('app_user', fixture.user.id);
        const beforeAudit = await audits(fixture.user.id);
        const response = await harness.send(admin, 'patch', `/users/${fixture.user.id}`, {
          expectedVersion: fixture.user.version,
          reason,
          ...patch,
        });
        expect(response.status).toBe(409);
        expect(response.body.code).toBe('USER_ACTIVE_ROUTE');
        expect(await snapshot('app_user', fixture.user.id)).toEqual(before);
        expect(await audits(fixture.user.id)).toEqual(beforeAudit);
        expect((await harness.send(principal, 'get', '/auth/session')).status).toBe(200);
      },
    );

    it('rejects assigned vehicle deactivation and preserves the route and audit history', async () => {
      const fixture = await routeFixture(state);
      const beforeAudit = await audits(fixture.vehicle.id);
      const response = await harness.send(admin, 'patch', `/vehicles/${fixture.vehicle.id}`, {
        expectedVersion: fixture.vehicle.version,
        code: fixture.vehicle.code,
        name: fixture.vehicle.name,
        active: false,
        reason,
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('VEHICLE_ASSIGNED');
      expect(
        await harness.database
          .selectFrom('vehicle')
          .selectAll()
          .where('id', '=', fixture.vehicle.id)
          .executeTakeFirstOrThrow(),
      ).toEqual(fixture.vehicle);
      expect(
        (
          await harness.database
            .selectFrom('route')
            .selectAll()
            .where('id', '=', fixture.route.id)
            .executeTakeFirstOrThrow()
        ).state,
      ).toBe(state);
      expect(await audits(fixture.vehicle.id)).toEqual(beforeAudit);
    });
  });

  it.each(['driver', 'vehicle'] as const)(
    'enforces non-overlapping active %s assignments in PostgreSQL',
    async (kind) => {
      const fixture = await routeFixture('EN_ROUTE');
      const other = await routeFixture('CLOSED');
      const before = await harness.database
        .selectFrom('route')
        .select('id')
        .orderBy('id')
        .execute();
      const beforeAudit = await harness.database
        .selectFrom('audit_event')
        .select('id')
        .orderBy('id')
        .execute();
      await expect(
        new RouteLoadService(harness.database).create(
          {
            originLocationId: fixture.route.origin_location_id,
            driverId: kind === 'driver' ? fixture.user.id : other.user.id,
            vehicleId: kind === 'vehicle' ? fixture.vehicle.id : other.vehicle.id,
            businessDate: '2026-09-07',
          },
          { actorId: admin.id, requestId: crypto.randomUUID() },
        ),
      ).rejects.toMatchObject({ code: '23505' });
      expect(
        await harness.database.selectFrom('route').select('id').orderBy('id').execute(),
      ).toEqual(before);
      expect(
        await harness.database.selectFrom('audit_event').select('id').orderBy('id').execute(),
      ).toEqual(beforeAudit);
    },
  );

  it('preserves committed sale, movement, ticket, and actor history after deactivating a former Driver', async () => {
    const fixture = await createSaleScenario(harness.database);
    await new SaleService(harness.database).confirm(
      saleCommand({
        customerId: fixture.customer.id,
        routeId: fixture.route.id,
        productId: fixture.product.id,
      }),
      {
        actorId: fixture.driver.id,
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      },
    );
    // A closed historical route is fixture state; route transitions are covered by US3.
    await harness.database
      .updateTable('route')
      .set({ state: 'CLOSED', returned_at: new Date(), closed_at: new Date(), closed_by: admin.id })
      .where('id', '=', fixture.route.id)
      .execute();
    async function history() {
      return {
        sales: await harness.database
          .selectFrom('sale')
          .selectAll()
          .where('driver_id', '=', fixture.driver.id)
          .execute(),
        lines: await harness.database
          .selectFrom('sale_line')
          .innerJoin('sale', 'sale.id', 'sale_line.sale_id')
          .selectAll('sale_line')
          .where('sale.driver_id', '=', fixture.driver.id)
          .execute(),
        tickets: await harness.database
          .selectFrom('sale_ticket')
          .innerJoin('sale', 'sale.id', 'sale_ticket.sale_id')
          .selectAll('sale_ticket')
          .where('sale.driver_id', '=', fixture.driver.id)
          .execute(),
        movements: await harness.database
          .selectFrom('inventory_movement')
          .selectAll()
          .where('actor_id', '=', fixture.driver.id)
          .execute(),
        audits: await harness.database
          .selectFrom('audit_event')
          .selectAll()
          .where('actor_id', '=', fixture.driver.id)
          .execute(),
      };
    }
    const before = await history();
    expect(before.sales).toHaveLength(1);
    expect(before.movements.length).toBeGreaterThan(0);
    expect(before.audits.length).toBeGreaterThan(0);
    const user = await userRow(fixture.driver.id);
    const principal = await harness.login(user.username);
    expect(
      (
        await harness.send(admin, 'patch', `/users/${user.id}`, {
          expectedVersion: user.version,
          active: false,
          reason,
        })
      ).status,
    ).toBe(200);
    expect(await history()).toEqual(before);
    expect((await userRow(user.id)).active).toBe(false);
    expect((await harness.send(principal, 'get', '/auth/session')).status).toBe(401);
    await expect(
      harness.database.deleteFrom('app_user').where('id', '=', user.id).execute(),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(23503|23001)$/) });
  });

  it('commits business settings and their audit against the stable singleton identity', async () => {
    const before = await snapshot('business_setting', settingId);
    const response = await harness.send(admin, 'patch', '/settings/business', {
      expectedVersion: before!.row.version,
      currencyCode: 'USD',
      businessTimezone: 'America/Mexico_City',
      reason,
    });
    expect(response.status).toBe(200);
    expect((await snapshot('business_setting', settingId))!.row).toMatchObject({
      currency_code: 'USD',
      business_timezone: 'America/Mexico_City',
      updated_by: admin.id,
      version: Number(before!.row.version) + 1,
    });
    await expectAudit(
      'business_setting',
      settingId,
      admin.id,
      'SETTING_UPDATED',
      { currencyCode: before!.row.currency_code, businessTimezone: before!.row.business_timezone },
      { currencyCode: 'USD', businessTimezone: 'America/Mexico_City' },
    );
  });

  it('rolls back business settings and leaves no success audit when auditing fails', async () => {
    const before = await snapshot('business_setting', settingId);
    const beforeAudit = await audits(settingId);
    await rejectAuditWrites();
    await expectAuditFailure(
      (
        await harness.send(admin, 'patch', '/settings/business', {
          expectedVersion: before!.row.version,
          currencyCode: 'MXN',
          businessTimezone: 'America/Tijuana',
          reason,
        })
      ).status,
    );
    expect(await snapshot('business_setting', settingId)).toEqual(before);
    expect(await audits(settingId)).toEqual(beforeAudit);
  });

  it('creates and edits printer metadata with same-transaction audit snapshots', async () => {
    const printer = await printerFixture();
    await expectAudit('printer_profile', printer.id, admin.id, 'PRINTER_SETTING_CHANGED', null, {
      name: printer.input.name,
    });
    const response = await harness.send(admin, 'patch', `/printer-profiles/${printer.id}`, {
      ...printer.input,
      expectedVersion: printer.version,
      active: true,
      name: 'Updated printer',
      reason,
    });
    expect(response.status).toBe(200);
    expect((await snapshot('printer_profile', printer.id))!.row).toMatchObject({
      name: 'Updated printer',
      version: printer.version + 1,
    });
    await expectAudit(
      'printer_profile',
      printer.id,
      admin.id,
      'PRINTER_SETTING_CHANGED',
      { name: printer.input.name },
      { name: 'Updated printer' },
    );
  });

  it('archives a referenced printer without erasing its attempts or allowing new use', async () => {
    const printer = await printerFixture();
    const user = await userFixture();
    const principal = await harness.login(user.username);
    expect(
      (
        await harness.send(principal, 'put', '/me/printer-preference', {
          printerProfileId: printer.id,
          deviceLabel: 'Historical printer',
        })
      ).status,
    ).toBe(200);
    const attempt = await harness.send(principal, 'post', '/output-attempts', {
      mode: 'TEST_PRINT',
      printerProfileId: printer.id,
      state: 'SUCCEEDED',
    });
    expect(attempt.status).toBe(201);
    const history =
      await sql`select * from output_attempt where id = ${attempt.body.data.id}::uuid`.execute(
        harness.database,
      );
    const response = await harness.send(admin, 'patch', `/printer-profiles/${printer.id}`, {
      ...printer.input,
      expectedVersion: printer.version,
      active: false,
      reason,
    });
    expect(response.status).toBe(200);
    expect((await snapshot('printer_profile', printer.id))!.row).toMatchObject({
      active: false,
      version: printer.version + 1,
    });
    await expectAudit(
      'printer_profile',
      printer.id,
      admin.id,
      'PRINTER_SETTING_CHANGED',
      { active: true },
      { active: false },
    );
    expect(
      (
        await sql`select * from output_attempt where id = ${attempt.body.data.id}::uuid`.execute(
          harness.database,
        )
      ).rows,
    ).toEqual(history.rows);
    const preferenceBefore = await snapshot('user_printer_preference', user.id);
    const auditsBefore = await audits(user.id);
    expect(
      (
        await harness.send(principal, 'put', '/me/printer-preference', {
          printerProfileId: printer.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await harness.send(principal, 'post', '/output-attempts', {
          mode: 'TEST_PRINT',
          printerProfileId: printer.id,
          state: 'STARTED',
        })
      ).status,
    ).toBe(409);
    expect(await snapshot('user_printer_preference', user.id)).toEqual(preferenceBefore);
    expect(await audits(user.id)).toEqual(auditsBefore);
    expect(
      (
        await sql`select * from output_attempt where printer_profile_id = ${printer.id}::uuid`.execute(
          harness.database,
        )
      ).rows,
    ).toEqual(history.rows);
    await expect(
      sql`delete from printer_profile where id = ${printer.id}::uuid`.execute(harness.database),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(23503|23001)$/) });
  });

  it('rolls back printer creation when auditing fails', async () => {
    const name = `Rejected printer ${crypto.randomUUID()}`;
    await rejectAuditWrites();
    await expectAuditFailure(
      (await harness.send(admin, 'post', '/printer-profiles', { ...testPrinterProfile, name }))
        .status,
    );
    expect(
      (await sql`select id from printer_profile where name = ${name}`.execute(harness.database))
        .rows,
    ).toEqual([]);
    expect(
      (
        await sql`select id from audit_event where after_values->>'name' = ${name}`.execute(
          harness.database,
        )
      ).rows,
    ).toEqual([]);
  });

  it.each([true, false])(
    'rolls back printer update (active=%s) when auditing fails',
    async (active) => {
      const printer = await printerFixture();
      const before = await snapshot('printer_profile', printer.id);
      const beforeAudit = await audits(printer.id);
      await rejectAuditWrites();
      await expectAuditFailure(
        (
          await harness.send(admin, 'patch', `/printer-profiles/${printer.id}`, {
            ...printer.input,
            expectedVersion: printer.version,
            active,
            name: 'Must roll back',
            reason,
          })
        ).status,
      );
      expect(await snapshot('printer_profile', printer.id)).toEqual(before);
      expect(await audits(printer.id)).toEqual(beforeAudit);
    },
  );

  it('isolates preferences by authenticated user and audits both insert and replacement', async () => {
    const first = await printerFixture();
    const second = await printerFixture();
    const alice = await userFixture();
    const bob = await userFixture();
    const aliceSession = await harness.login(alice.username);
    const bobSession = await harness.login(bob.username);
    for (const principal of [aliceSession, bobSession]) {
      expect(
        (
          await harness.send(principal, 'put', '/me/printer-preference', {
            printerProfileId: first.id,
            deviceLabel: 'Original',
          })
        ).status,
      ).toBe(200);
      await expectAudit(
        'user_printer_preference',
        principal.id,
        principal.id,
        'PRINTER_SETTING_CHANGED',
        null,
        { printerProfileId: first.id, deviceLabel: 'Original' },
      );
    }
    const bobBefore = await snapshot('user_printer_preference', bob.id);
    const bobAudit = await audits(bob.id);
    expect(
      (
        await harness.send(aliceSession, 'put', '/me/printer-preference', {
          printerProfileId: second.id,
          deviceLabel: 'Replacement',
        })
      ).status,
    ).toBe(200);
    await expectAudit(
      'user_printer_preference',
      alice.id,
      alice.id,
      'PRINTER_SETTING_CHANGED',
      { printerProfileId: first.id },
      { printerProfileId: second.id },
    );
    expect((await snapshot('user_printer_preference', alice.id))!.row).toMatchObject({
      user_id: alice.id,
      printer_profile_id: second.id,
    });
    expect(
      (
        await sql`select * from user_printer_preference where user_id = ${alice.id}::uuid`.execute(
          harness.database,
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await harness.send(aliceSession, 'get', '/me/printer-preference')).body.data
        .printerProfileId,
    ).toBe(second.id);
    expect(
      (await harness.send(bobSession, 'get', '/me/printer-preference')).body.data.printerProfileId,
    ).toBe(first.id);
    expect(
      (
        await harness.send(aliceSession, 'put', '/me/printer-preference', {
          userId: bob.id,
          printerProfileId: second.id,
        })
      ).status,
    ).toBe(422);
    expect(await snapshot('user_printer_preference', bob.id)).toEqual(bobBefore);
    expect(await audits(bob.id)).toEqual(bobAudit);
  });

  it.each([false, true])(
    'rolls back preference mutation (existing=%s) when auditing fails',
    async (existing) => {
      const first = await printerFixture();
      const second = await printerFixture();
      const user = await userFixture();
      const principal = await harness.login(user.username);
      if (existing)
        expect(
          (
            await harness.send(principal, 'put', '/me/printer-preference', {
              printerProfileId: first.id,
            })
          ).status,
        ).toBe(200);
      const before = await snapshot('user_printer_preference', user.id);
      const beforeAudit = await audits(user.id);
      await rejectAuditWrites();
      await expectAuditFailure(
        (
          await harness.send(principal, 'put', '/me/printer-preference', {
            printerProfileId: second.id,
            deviceLabel: 'Rejected replacement',
          })
        ).status,
      );
      expect(await snapshot('user_printer_preference', user.id)).toEqual(before);
      expect(await audits(user.id)).toEqual(beforeAudit);
    },
  );
});

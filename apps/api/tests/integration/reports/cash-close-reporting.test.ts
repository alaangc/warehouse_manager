import type { Express } from 'express';
import { sql } from 'kysely';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import type { Environment } from '../../../src/config/env.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { CancellationService } from '../../../src/modules/sales/cancellation-service.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { createServer } from '../../../src/server.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

interface Principal {
  cookie: string;
  csrf: string;
  id: string;
}

type FailureTarget = 'snapshot' | 'pointer' | 'idempotency' | 'audit';

const env: Environment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
  SESSION_SECRET: 'x'.repeat(32),
  APP_ORIGIN: 'https://warehouse.test',
  BUSINESS_TIMEZONE: 'America/Hermosillo',
  BUSINESS_CURRENCY: 'MXN',
  PORT: 3000,
  LOG_LEVEL: 'fatal',
  DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-cash-close-reporting',
};

describe('cash-close snapshots and transaction rollback', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let databaseReady = false;
  let app: Express;
  let admin: Principal;

  async function login(): Promise<Principal> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .send({ username: 'admin', password: 'development-password-change-me' });
    expect(response.status).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    return {
      cookie: cookie.split(';')[0]!,
      csrf: String(response.headers['x-csrf-token']),
      id: (response.body.data as { id: string }).id,
    };
  }

  function command(path: string, body: unknown, key = `report-${crypto.randomUUID()}`) {
    return request(app)
      .post(`/api/v1${path}`)
      .set('Origin', env.APP_ORIGIN)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send(body);
  }

  function detail(id: string) {
    return request(app)
      .get(`/api/v1/cash-closes/${id}`)
      .set('Origin', env.APP_ORIGIN)
      .set('Cookie', admin.cookie);
  }

  async function createCompletedSale(input: {
    unitPrice: string;
    reportingGroup: 'SODAS' | 'CHARCOAL' | 'TOSTADAS' | 'OTHER';
    cancelled?: boolean;
  }) {
    const scenario = await createSaleScenario(database, {
      stockQuantity: '5.000',
      standardUnitPrice: input.unitPrice,
    });
    await database
      .updateTable('category')
      .set({ reporting_group: input.reportingGroup })
      .where('id', '=', scenario.category.id)
      .executeTakeFirstOrThrow();
    const context = {
      actorId: scenario.driver.id,
      idempotencyKey: `sale-${crypto.randomUUID()}`,
      requestId: crypto.randomUUID(),
    };
    const sale = await new SaleService(database).confirm(
      saleCommand({
        customerId: scenario.customer.id,
        routeId: scenario.route.id,
        productId: scenario.product.id,
      }),
      context,
    );
    await database
      .updateTable('sale')
      .set({ completed_at: new Date('2026-09-04T15:00:00Z') })
      .where('id', '=', sale.id)
      .executeTakeFirstOrThrow();
    if (input.cancelled) {
      await new CancellationService(database).cancel(sale.id, 'Cancelled fixture', {
        actorId: admin.id,
        idempotencyKey: `cancel-${crypto.randomUUID()}`,
        requestId: crypto.randomUUID(),
      });
    }
    return { sale, scenario };
  }

  async function clearFailureTriggers() {
    await sql`
      do $$ begin
        if to_regclass('public.cash_close_line') is not null then
          execute 'drop trigger if exists test_reject_cash_close_line on cash_close_line';
        end if;
        if to_regclass('public.cash_close_current_period') is not null then
          execute 'drop trigger if exists test_reject_cash_close_pointer on cash_close_current_period';
        end if;
      end $$;
      drop trigger if exists test_reject_cash_close_idempotency on idempotency_request;
      drop trigger if exists test_reject_cash_close_audit on audit_event;
      drop function if exists test_reject_cash_close_write()
    `.execute(database);
  }

  async function injectFailure(target: FailureTarget) {
    await clearFailureTriggers();
    await sql`
      create function test_reject_cash_close_write() returns trigger language plpgsql as $$
      begin raise exception 'injected cash-close ${sql.raw(target)} failure'; end $$
    `.execute(database);
    if (target === 'snapshot') {
      await sql`
        create trigger test_reject_cash_close_line before insert on cash_close_line
        for each row execute function test_reject_cash_close_write()
      `.execute(database);
    } else if (target === 'pointer') {
      await sql`
        create trigger test_reject_cash_close_pointer before insert on cash_close_current_period
        for each row execute function test_reject_cash_close_write()
      `.execute(database);
    } else if (target === 'idempotency') {
      await sql`
        create trigger test_reject_cash_close_idempotency before insert or update on idempotency_request
        for each row execute function test_reject_cash_close_write()
      `.execute(database);
    } else {
      await sql`
        create trigger test_reject_cash_close_audit before insert on audit_event
        for each row execute function test_reject_cash_close_write()
      `.execute(database);
    }
  }

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    databaseReady = true;
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
    env.DATABASE_URL = container.connectionString;
    app = createServer(env, { database });
    admin = await login();
  }, 120_000);

  afterAll(async () => {
    if (databaseReady) {
      await clearFailureTriggers();
      await database.destroy();
    }
    await container?.container.stop();
  });

  it('snapshots only completed sales and remains reproducible after catalog changes', async () => {
    const included = await createCompletedSale({ unitPrice: '10.0050', reportingGroup: 'OTHER' });
    const cancelled = await createCompletedSale({
      unitPrice: '99.0000',
      reportingGroup: 'SODAS',
      cancelled: true,
    });
    const createdResponse = await command('/cash-closes', {
      periodKind: 'DAY',
      anchorDate: '2026-09-04',
    });
    expect(createdResponse.status).toBe(201);
    const created = createdResponse.body.data;
    expect(created).toMatchObject({
      periodStart: '2026-09-04T07:00:00Z',
      periodEnd: '2026-09-05T07:00:00Z',
      grossTotal: '10.01',
      partnerAmount: '5.01',
      remainingAmount: '5.00',
      contributingSaleIds: [included.sale.id],
    });
    expect(created.contributingSaleIds).not.toContain(cancelled.sale.id);
    expect(created.lines).toEqual([
      { reportingGroup: 'SODAS', total: '0.00' },
      { reportingGroup: 'CHARCOAL', total: '0.00' },
      { reportingGroup: 'TOSTADAS', total: '0.00' },
      { reportingGroup: 'OTHER', total: '10.01' },
    ]);

    await database
      .updateTable('product')
      .set({ name: 'Renamed after close', standard_unit_price: '500.0000' })
      .where('id', '=', included.scenario.product.id)
      .executeTakeFirstOrThrow();
    await database
      .updateTable('category')
      .set({ name: `Changed ${crypto.randomUUID()}`, reporting_group: 'CHARCOAL' })
      .where('id', '=', included.scenario.category.id)
      .executeTakeFirstOrThrow();
    const preserved = await detail(created.id);
    expect(preserved.status).toBe(200);
    expect(preserved.body.data).toEqual(created);

    const linkedSales = await sql<{ sale_id: string; included_amount: string }>`
      select sale_id, included_amount from cash_close_sale where cash_close_id = ${created.id}
    `.execute(database);
    expect(linkedSales.rows).toEqual([{ sale_id: included.sale.id, included_amount: '10.01' }]);
  });

  it('stores resolved report snapshots with exact filters and source results', async () => {
    const response = await command('/report-snapshots', {
      reportType: 'FINANCIAL_SUMMARY',
      filters: { periodKind: 'DAY', anchorDate: '2026-09-07' },
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      reportType: 'FINANCIAL_SUMMARY',
      businessTimezone: 'America/Hermosillo',
      filters: {
        periodKind: 'DAY',
        anchorDate: '2026-09-07',
        periodStart: '2026-09-07T07:00:00Z',
        periodEnd: '2026-09-08T07:00:00Z',
      },
      result: {
        totals: {
          grossTotal: expect.stringMatching(/^\d+\.\d{2}$/),
          partnerAmount: expect.stringMatching(/^\d+\.\d{2}$/),
          remainingAmount: expect.stringMatching(/^\d+\.\d{2}$/),
        },
      },
    });
    const stored = await sql<{ filters: unknown; result: unknown }>`
      select filters, result from report_snapshot where id = ${response.body.data.id}
    `.execute(database);
    expect(stored.rows).toEqual([
      { filters: response.body.data.filters, result: response.body.data.result },
    ]);
  });

  it.each<FailureTarget>(['snapshot', 'pointer', 'idempotency', 'audit'])(
    'rolls back the whole close when the %s write fails',
    async (target) => {
      const anchorDate =
        target === 'snapshot'
          ? '2026-09-20'
          : target === 'pointer'
            ? '2026-09-21'
            : target === 'idempotency'
              ? '2026-09-22'
              : '2026-09-23';
      const key = `rollback-${target}-${crypto.randomUUID()}`;
      try {
        await injectFailure(target);
        const response = await command('/cash-closes', { periodKind: 'DAY', anchorDate }, key);
        expect(response.status).toBe(500);
      } finally {
        await clearFailureTriggers();
      }
      const persisted = await sql<{ count: string }>`
        select count(*)::text as count from cash_close where anchor_date = ${anchorDate}::date
      `.execute(database);
      expect(persisted.rows[0]?.count).toBe('0');
      const pointer = await sql<{ count: string }>`
        select count(*)::text as count
        from cash_close_current_period
        where period_start = ${new Date(`${anchorDate}T07:00:00Z`)}
      `.execute(database);
      expect(pointer.rows[0]?.count).toBe('0');
      const idempotency = await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', key)
        .executeTakeFirst();
      expect(idempotency).toBeUndefined();
      const audit = await sql<{ id: string }>`
        select id from audit_event
        where entity_type = 'CASH_CLOSE' and after_values->>'anchorDate' = ${anchorDate}
      `.execute(database);
      expect(audit.rows).toHaveLength(0);
    },
  );
});

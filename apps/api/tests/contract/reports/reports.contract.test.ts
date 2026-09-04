import type { Express } from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import type { Environment } from '../../../src/config/env.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { createServer } from '../../../src/server.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

interface Principal {
  cookie: string;
  csrf: string;
}

interface CashCloseResource {
  id: string;
  closeNumber: string;
  periodKind: 'DAY' | 'WEEK' | 'MONTH';
  anchorDate: string;
  periodStart: string;
  periodEnd: string;
  businessTimezone: string;
  status: 'CURRENT' | 'SUPERSEDED';
  supersedesCashCloseId: string | null;
  supersededByCashCloseId: string | null;
  correctionReason: string | null;
  currencyCode: string;
  grossTotal: string;
  partnerRate: string;
  partnerAmount: string;
  remainingAmount: string;
  roundingMode: 'HALF_AWAY_FROM_ZERO';
  lines: Array<{ reportingGroup: string; total: string }>;
  contributingSaleIds: string[];
  createdBy: string;
  createdAt: string;
}

const env: Environment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
  SESSION_SECRET: 'x'.repeat(32),
  APP_ORIGIN: 'https://warehouse.test',
  BUSINESS_TIMEZONE: 'America/Hermosillo',
  BUSINESS_CURRENCY: 'MXN',
  PORT: 3000,
  LOG_LEVEL: 'fatal',
  DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-report-contract',
};

describe('reporting OpenAPI contract', () => {
  it('documents authoritative calendar requests and immutable cash-close operations', async () => {
    const openapi = await readFile(
      fileURLToPath(new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url)),
      'utf8',
    );
    for (const operationId of [
      'listCashCloses',
      'createCashClose',
      'getCashClose',
      'correctCashClose',
      'getSalesByDriverReport',
      'getBestSellingProductsReport',
      'getInventoryByBranchReport',
      'getFinancialSummaryReport',
      'createReportSnapshot',
    ]) {
      expect(openapi).toContain(`operationId: ${operationId}`);
    }
    expect(openapi).toContain('name: periodKind');
    expect(openapi).toContain('name: anchorDate');
    expect(openapi).toContain('enum: [CURRENT, SUPERSEDED]');
    expect(openapi).toContain('CASH_CLOSE_PERIOD_ALREADY_CURRENT');
    expect(openapi).toContain('CASH_CLOSE_NOT_CURRENT');
    expect(openapi).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(openapi).toContain('INVALID_REPORTING_PERIOD');
  });
});

describe('reporting HTTP contract', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let databaseReady = false;
  let app: Express;
  let admin: Principal;
  let driver: Principal;

  async function login(username: string): Promise<Principal> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .send({ username, password: 'development-password-change-me' });
    expect(response.status).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toBeDefined();
    expect(response.headers['x-csrf-token']).toBeDefined();
    return {
      cookie: cookie.split(';')[0]!,
      csrf: String(response.headers['x-csrf-token']),
    };
  }

  function authed(principal: Principal) {
    const agent = request(app);
    const decorate = (test: Test) =>
      test
        .set('Origin', env.APP_ORIGIN)
        .set('Cookie', principal.cookie)
        .set('X-CSRF-Token', principal.csrf);
    return {
      get: (path: string) => decorate(agent.get(path)),
      post: (path: string) => decorate(agent.post(path)),
    };
  }

  function command(principal: Principal, path: string, body: unknown, key: string) {
    return authed(principal).post(path).set('Idempotency-Key', key).send(body);
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
    [admin, driver] = await Promise.all([login('admin'), login('driver')]);
  }, 120_000);

  afterAll(async () => {
    if (databaseReady) await database.destroy();
    await container?.container.stop();
  });

  it('resolves report periods, returns exact strings, validates input, and denies Drivers', async () => {
    const endpoints = [
      ['/reports/sales-by-driver', 'SALES_BY_DRIVER'],
      ['/reports/best-selling-products', 'BEST_SELLING_PRODUCTS'],
      ['/reports/financial-summary', 'FINANCIAL_SUMMARY'],
    ] as const;
    for (const [path, reportType] of endpoints) {
      const response = await authed(admin).get(`${path}?periodKind=DAY&anchorDate=2026-09-04`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        reportType,
        businessTimezone: 'America/Hermosillo',
        filters: {
          periodKind: 'DAY',
          anchorDate: '2026-09-04',
          periodStart: '2026-09-04T07:00:00Z',
          periodEnd: '2026-09-05T07:00:00Z',
        },
      });
      expect(response.body.data.rows).toBeInstanceOf(Array);
      expect(
        (await authed(driver).get(`${path}?periodKind=DAY&anchorDate=2026-09-04`)).status,
      ).toBe(403);
    }

    const inventory = await authed(admin).get('/reports/inventory-by-branch');
    expect(inventory.status).toBe(200);
    expect(inventory.body.data).toMatchObject({
      reportType: 'INVENTORY_BY_BRANCH',
      businessTimezone: 'America/Hermosillo',
    });
    expect(inventory.body.data.rows).toBeInstanceOf(Array);
    expect((await authed(driver).get('/reports/inventory-by-branch')).status).toBe(403);

    for (const query of [
      'periodKind=YEAR&anchorDate=2026-09-04',
      'periodKind=DAY&anchorDate=2026-02-30',
      'periodKind=DAY',
    ]) {
      const invalid = await authed(admin).get(`/reports/financial-summary?${query}`);
      expect(invalid.status).toBe(422);
      expect(invalid.body).toMatchObject({ code: 'INVALID_REPORTING_PERIOD', status: 422 });
    }
  });

  it('replays one close, rejects duplicates, and preserves an immutable correction chain', async () => {
    const body = { periodKind: 'DAY', anchorDate: '2026-09-04' };
    const replayKey = `cash-close-${crypto.randomUUID()}`;
    const createdResponse = await command(admin, '/cash-closes', body, replayKey);
    expect(createdResponse.status).toBe(201);
    const created = createdResponse.body.data as CashCloseResource;
    expect(created).toMatchObject({
      periodKind: 'DAY',
      anchorDate: '2026-09-04',
      periodStart: '2026-09-04T07:00:00Z',
      periodEnd: '2026-09-05T07:00:00Z',
      businessTimezone: 'America/Hermosillo',
      status: 'CURRENT',
      supersedesCashCloseId: null,
      supersededByCashCloseId: null,
      correctionReason: null,
      currencyCode: 'MXN',
      grossTotal: '0.00',
      partnerRate: '0.500000',
      partnerAmount: '0.00',
      remainingAmount: '0.00',
      roundingMode: 'HALF_AWAY_FROM_ZERO',
      lines: [
        { reportingGroup: 'SODAS', total: '0.00' },
        { reportingGroup: 'CHARCOAL', total: '0.00' },
        { reportingGroup: 'TOSTADAS', total: '0.00' },
        { reportingGroup: 'OTHER', total: '0.00' },
      ],
      contributingSaleIds: [],
    });
    expect(typeof created.id).toBe('string');
    expect(typeof created.closeNumber).toBe('string');

    const replay = await command(admin, '/cash-closes', body, replayKey);
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(created);
    const reusedKey = await command(
      admin,
      '/cash-closes',
      { periodKind: 'DAY', anchorDate: '2026-09-05' },
      replayKey,
    );
    expect(reusedKey.status).toBe(409);
    expect(reusedKey.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const duplicate = await command(
      admin,
      '/cash-closes',
      body,
      `cash-close-${crypto.randomUUID()}`,
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CASH_CLOSE_PERIOD_ALREADY_CURRENT');

    const missingReason = await command(
      admin,
      `/cash-closes/${created.id}/corrections`,
      { reason: ' ' },
      `cash-close-${crypto.randomUUID()}`,
    );
    expect(missingReason.status).toBe(422);
    const correctedResponse = await command(
      admin,
      `/cash-closes/${created.id}/corrections`,
      { reason: 'Late sale was recorded' },
      `cash-close-${crypto.randomUUID()}`,
    );
    expect(correctedResponse.status).toBe(201);
    const corrected = correctedResponse.body.data as CashCloseResource;
    expect(corrected).toMatchObject({
      status: 'CURRENT',
      supersedesCashCloseId: created.id,
      supersededByCashCloseId: null,
      correctionReason: 'Late sale was recorded',
      periodStart: created.periodStart,
      periodEnd: created.periodEnd,
    });

    const originalDetail = await authed(admin).get(`/cash-closes/${created.id}`);
    expect(originalDetail.status).toBe(200);
    expect(originalDetail.body.data).toMatchObject({
      id: created.id,
      status: 'SUPERSEDED',
      supersededByCashCloseId: corrected.id,
      supersedesCashCloseId: null,
    });
    const stale = await command(
      admin,
      `/cash-closes/${created.id}/corrections`,
      { reason: 'Attempt to branch history' },
      `cash-close-${crypto.randomUUID()}`,
    );
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CASH_CLOSE_NOT_CURRENT');

    const list = await authed(admin).get(
      '/cash-closes?periodKind=DAY&anchorDate=2026-09-04&limit=1',
    );
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.page).toMatchObject({ hasNextPage: true });
    expect(typeof list.body.page.nextCursor).toBe('string');
    const next = await authed(admin).get(
      `/cash-closes?periodKind=DAY&anchorDate=2026-09-04&limit=1&cursor=${encodeURIComponent(String(list.body.page.nextCursor))}`,
    );
    expect(next.status).toBe(200);
    expect(next.body.data).toHaveLength(1);
    expect(new Set([...list.body.data, ...next.body.data].map((close) => close.id))).toEqual(
      new Set([created.id, corrected.id]),
    );
  });

  it('enforces Administrator access and preserves validated report snapshots', async () => {
    const period = { periodKind: 'DAY', anchorDate: '2026-09-06' };
    expect(
      (await command(driver, '/cash-closes', period, `driver-${crypto.randomUUID()}`)).status,
    ).toBe(403);
    expect((await authed(driver).get('/cash-closes')).status).toBe(403);
    expect(
      (
        await command(
          driver,
          `/cash-closes/${crypto.randomUUID()}/corrections`,
          { reason: 'Forbidden' },
          `driver-${crypto.randomUUID()}`,
        )
      ).status,
    ).toBe(403);

    const snapshotBody = {
      reportType: 'FINANCIAL_SUMMARY',
      filters: period,
    };
    const snapshot = await command(
      admin,
      '/report-snapshots',
      snapshotBody,
      `report-snapshot-${crypto.randomUUID()}`,
    );
    expect(snapshot.status).toBe(201);
    expect(snapshot.body.data).toMatchObject({
      reportType: 'FINANCIAL_SUMMARY',
      businessTimezone: 'America/Hermosillo',
      filters: {
        ...period,
        periodStart: '2026-09-06T07:00:00Z',
        periodEnd: '2026-09-07T07:00:00Z',
      },
      result: {
        totals: {
          grossTotal: expect.stringMatching(/^\d+\.\d{2}$/),
          partnerAmount: expect.stringMatching(/^\d+\.\d{2}$/),
          remainingAmount: expect.stringMatching(/^\d+\.\d{2}$/),
        },
      },
    });
    expect(
      (await command(driver, '/report-snapshots', snapshotBody, crypto.randomUUID())).status,
    ).toBe(403);
  });
});

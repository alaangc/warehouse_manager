import type { Express } from 'express';
import { sql } from 'kysely';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
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

interface CashClose {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'CURRENT' | 'SUPERSEDED';
  supersedesCashCloseId: string | null;
  supersededByCashCloseId: string | null;
  correctionReason: string | null;
  grossTotal: string;
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
  DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-cash-close-currentness',
};

describe('cash-close currentness and correction races', () => {
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
    };
  }

  function command(path: string, body: unknown, key = `cash-close-${crypto.randomUUID()}`) {
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
    if (databaseReady) await database.destroy();
    await container?.container.stop();
  });

  it('replays the same key while competing keys create exactly one current period pointer', async () => {
    const requestBody = { periodKind: 'DAY', anchorDate: '2026-09-10' };
    const replayKey = `cash-close-${crypto.randomUUID()}`;
    const createdResponse = await command('/cash-closes', requestBody, replayKey);
    expect(createdResponse.status).toBe(201);
    const created = createdResponse.body.data as CashClose;

    const replay = await command('/cash-closes', requestBody, replayKey);
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(created);

    const occupiedPeriod = { periodKind: 'DAY', anchorDate: '2026-09-11' };
    const competing = await Promise.all([
      command('/cash-closes', occupiedPeriod),
      command('/cash-closes', occupiedPeriod),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(competing.find((response) => response.status === 409)?.body.code).toBe(
      'CASH_CLOSE_PERIOD_ALREADY_CURRENT',
    );

    const pointers = await sql<{ count: string }>`
      select count(*)::text as count
      from cash_close_current_period
      where business_timezone = 'America/Hermosillo'
        and period_start = '2026-09-11T07:00:00Z'::timestamptz
        and period_end = '2026-09-12T07:00:00Z'::timestamptz
    `.execute(database);
    expect(pointers.rows[0]?.count).toBe('1');
    const closes = await sql<{ count: string }>`
      select count(*)::text as count
      from cash_close
      where period_start = '2026-09-11T07:00:00Z'::timestamptz
        and period_end = '2026-09-12T07:00:00Z'::timestamptz
    `.execute(database);
    expect(closes.rows[0]?.count).toBe('1');
  });

  it('allows one concurrent correction and compare-and-swaps the pointer without branching', async () => {
    const initialResponse = await command('/cash-closes', {
      periodKind: 'DAY',
      anchorDate: '2026-09-12',
    });
    expect(initialResponse.status).toBe(201);
    const initial = initialResponse.body.data as CashClose;

    const corrections = await Promise.all([
      command(`/cash-closes/${initial.id}/corrections`, { reason: 'First correction' }),
      command(`/cash-closes/${initial.id}/corrections`, { reason: 'Competing correction' }),
    ]);
    expect(corrections.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(corrections.find((response) => response.status === 409)?.body.code).toBe(
      'CASH_CLOSE_NOT_CURRENT',
    );
    const winner = corrections.find((response) => response.status === 201)!.body.data as CashClose;
    expect(winner).toMatchObject({
      status: 'CURRENT',
      supersedesCashCloseId: initial.id,
      supersededByCashCloseId: null,
    });

    const pointer = await sql<{ current_cash_close_id: string }>`
      select current_cash_close_id
      from cash_close_current_period
      where business_timezone = 'America/Hermosillo'
        and period_start = ${new Date(initial.periodStart)}
        and period_end = ${new Date(initial.periodEnd)}
    `.execute(database);
    expect(pointer.rows).toEqual([{ current_cash_close_id: winner.id }]);
    const successors = await sql<{ id: string }>`
      select id from cash_close where supersedes_cash_close_id = ${initial.id}
    `.execute(database);
    expect(successors.rows).toEqual([{ id: winner.id }]);
  });

  it('keeps immutable predecessors readable and rejects stale correction targets', async () => {
    const initialResponse = await command('/cash-closes', {
      periodKind: 'WEEK',
      anchorDate: '2026-09-16',
    });
    expect(initialResponse.status).toBe(201);
    const initial = initialResponse.body.data as CashClose;
    const correctedResponse = await command(`/cash-closes/${initial.id}/corrections`, {
      reason: 'Include reconciled late activity',
    });
    expect(correctedResponse.status).toBe(201);
    const corrected = correctedResponse.body.data as CashClose;

    const stale = await command(`/cash-closes/${initial.id}/corrections`, {
      reason: 'History must not branch',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CASH_CLOSE_NOT_CURRENT');
    const predecessor = await detail(initial.id);
    expect(predecessor.status).toBe(200);
    expect(predecessor.body.data).toEqual({
      ...initial,
      status: 'SUPERSEDED',
      supersededByCashCloseId: corrected.id,
    });
    const persisted = await sql<{
      id: string;
      supersedes_cash_close_id: string | null;
      correction_reason: string | null;
    }>`
      select id, supersedes_cash_close_id, correction_reason
      from cash_close
      where id in (${initial.id}, ${corrected.id})
      order by created_at
    `.execute(database);
    expect(persisted.rows).toEqual([
      { id: initial.id, supersedes_cash_close_id: null, correction_reason: null },
      {
        id: corrected.id,
        supersedes_cash_close_id: initial.id,
        correction_reason: 'Include reconciled late activity',
      },
    ]);
  });
});

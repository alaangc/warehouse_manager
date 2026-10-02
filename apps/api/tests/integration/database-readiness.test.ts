import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import * as foundation from '../../../../database/migrations/001_foundation.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type AppDatabase } from '../../src/db/database.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import { assertDatabaseReady } from '../../src/db/readiness.js';
import { createHealthRouter } from '../../src/http/health-routes.js';
import { startServer } from '../../src/server.js';
import type { Environment } from '../../src/config/env.js';
import { startPostgres, type TestDatabase } from '../support/postgres-container.js';

describe('database schema readiness', () => {
  let postgres: TestDatabase;
  let database: AppDatabase;
  const app = express();
  const environment = (): Environment => ({
    NODE_ENV: 'test',
    DATABASE_URL: postgres.connectionString,
    SESSION_SECRET: 'x'.repeat(32),
    APP_ORIGIN: 'https://warehouse.test',
    BUSINESS_TIMEZONE: 'America/Hermosillo',
    BUSINESS_CURRENCY: 'MXN',
    PORT: 0,
    LOG_LEVEL: 'fatal',
    DOCUMENT_STORAGE_PATH: 'var/documents',
  });
  beforeAll(async () => {
    postgres = await startPostgres();
    database = createDatabase(postgres.connectionString);
    app.use('/api/v1', createHealthRouter(database));
  });
  afterAll(async () => {
    await database?.destroy();
    await postgres?.container.stop();
  });

  async function unavailable() {
    await expect(assertDatabaseReady(database)).rejects.toThrow();
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      type: 'https://warehouse-manager.local/problems/not-ready',
      title: 'Service Unavailable',
      status: 503,
      code: 'NOT_READY',
      detail: 'A required dependency is unavailable.',
    });
  }

  it('rejects an empty database without creating migration tables', async () => {
    await unavailable();
    await expect(startServer(environment())).rejects.toThrow();
    const { rows } = await sql<{
      name: string;
    }>`select tablename as name from pg_tables where schemaname = 'public'`.execute(database);
    expect(rows).toEqual([]);
  });

  it('rejects a schema with only the foundation migration applied', async () => {
    const migrator = new Migrator({
      db: database,
      provider: { getMigrations: async () => ({ '001_foundation': foundation }) },
    });
    const result = await migrator.migrateToLatest();
    expect(result.error).toBeUndefined();
    await unavailable();
    await expect(startServer(environment())).rejects.toThrow();
    const { rows } = await sql<{ name: string }>`select name from kysely_migration`.execute(
      database,
    );
    expect(rows).toEqual([{ name: '001_foundation' }]);
  });

  it('accepts a current schema, including read-only database access', async () => {
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../database/migrations/', import.meta.url)),
    );
    await database.transaction().execute(async (transaction) => {
      await sql`set transaction read only`.execute(transaction);
      await assertDatabaseReady(transaction);
    });
    expect((await request(app).get('/api/v1/health')).body).toEqual({ status: 'ok' });
    const server = await startServer(environment());
    try {
      expect((await request(server).get('/api/v1/health')).status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('rejects stale, unknown and missing-middle migration histories and recovers', async () => {
    for (const name of ['008_document_output', '003_sales_core']) {
      const { rows } = await sql<{
        name: string;
        timestamp: string;
      }>`delete from kysely_migration where name = ${name} returning *`.execute(database);
      try {
        await unavailable();
        await expect(startServer(environment())).rejects.toThrow();
      } finally {
        await sql`insert into kysely_migration (name, timestamp) values (${name}, ${rows[0]!.timestamp})`.execute(
          database,
        );
      }
    }
    await sql`insert into kysely_migration (name, timestamp) values ('999_unknown', '2026-09-20T00:00:00.000Z')`.execute(
      database,
    );
    try {
      await unavailable();
      await expect(startServer(environment())).rejects.toThrow();
    } finally {
      await sql`delete from kysely_migration where name = '999_unknown'`.execute(database);
    }
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });

  it('returns a safe unavailable response after connectivity is lost', async () => {
    await database.destroy();
    await unavailable();
  });
});

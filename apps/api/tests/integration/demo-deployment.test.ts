import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'kysely';
import { startPostgres, type TestDatabase } from '../support/postgres-container.js';
import { createDatabase, type AppDatabase } from '../../src/db/database.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import { loadEnvironment } from '../../src/config/env.js';
import { createServer } from '../../src/server.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const run = promisify(execFile);
let postgres: TestDatabase;
let database: AppDatabase;
let environment: NodeJS.ProcessEnv;

beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.connectionString);
  await migrateToLatest(database);
  environment = {
    ...process.env,
    DATABASE_URL: postgres.connectionString,
    NODE_ENV: 'production',
    DEMO_MODE: 'true',
    DEMO_PASSWORD: 'isolated-demo-test-password',
    SESSION_SECRET: 'isolated-demo-test-secret-with-32-characters',
    APP_ORIGIN: 'https://demo.example.test',
    BUSINESS_TIMEZONE: 'America/Hermosillo',
    BUSINESS_CURRENCY: 'MXN',
    DOCUMENT_STORAGE_PATH: '/tmp/demo-test',
    LOG_LEVEL: 'fatal',
  };
}, 120_000);

afterAll(async () => {
  await database?.destroy();
  await postgres?.container.stop();
});

it('initializes once, preserves edits, and serves the UI with secure working authentication', async () => {
  const seed = () =>
    run(process.execPath, ['--import', 'tsx', 'database/seeds/demo.ts'], {
      cwd: root,
      env: environment,
    });
  await seed();
  await database
    .updateTable('product')
    .set({ name: 'Edited demo product' })
    .where('sku', '=', 'DEMO-REF')
    .execute();
  await seed();
  const products = await database.selectFrom('product').selectAll().execute();
  expect(products).toHaveLength(3);
  expect(products.find((product) => product.sku === 'DEMO-REF')?.name).toBe('Edited demo product');
  const counts = await sql<{ balances: string; movements: string }>`select
    (select count(*) from inventory_balance) as balances,
    (select count(*) from inventory_movement) as movements`.execute(database);
  expect(counts.rows[0]).toEqual({ balances: '3', movements: '3' });

  const app = createServer(loadEnvironment(environment), {
    database,
    webDirectory: path.join(root, 'apps/web/dist'),
  });
  await request(app).get('/').expect('Content-Type', /html/).expect(200);
  await request(app).get('/inventory').expect('Content-Type', /html/).expect(200);
  await request(app).get('/assets/missing.js').expect(404);
  await request(app).get('/api/v1/health').expect(200);
  await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'https://untrusted.example.test')
    .send({ username: 'demo-admin', password: environment.DEMO_PASSWORD })
    .expect(403);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', environment.APP_ORIGIN!)
    .send({ username: 'demo-admin', password: environment.DEMO_PASSWORD })
    .expect(200);
  const cookies = login.headers['set-cookie'] as unknown as string[];
  expect(cookies[0]).toContain('Secure');
  expect(cookies[0]).toContain('HttpOnly');
  await request(app).get('/api/v1/auth/session').set('Cookie', cookies).expect(200);
}, 60_000);

import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { startPostgres, type TestDatabase } from '../support/postgres-container.js';
import { createDatabase, type AppDatabase } from '../../src/db/database.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import { loadEnvironment } from '../../src/config/env.js';
import { createServer, startServer } from '../../src/server.js';
import { assertDatabaseReady } from '../../src/db/readiness.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const run = promisify(execFile);
let postgres: TestDatabase;
let database: AppDatabase;
let environment: NodeJS.ProcessEnv;

beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.connectionString);
  // Reproduce the old demo schema, then upgrade populated data below.
  const provider = new FileMigrationProvider({
    fs,
    path,
    migrationFolder: path.join(root, 'database/migrations'),
    import: (filePath) => import(pathToFileURL(filePath).href),
  });
  const migrations = await provider.getMigrations();
  const oldMigrator = new Migrator({
    db: database,
    provider: {
      getMigrations: async () =>
        Object.fromEntries(Object.entries(migrations).filter(([name]) => name < '008')),
    },
  });
  const result = await oldMigrator.migrateToLatest();
  if (result.error) throw result.error;
  environment = {
    ...process.env,
    DATABASE_URL: postgres.connectionString,
    NODE_ENV: 'production',
    DEMO_MODE: 'true',
    DEMO_PASSWORD: 'isolated-demo-test-password',
    SESSION_SECRET: randomBytes(32).toString('hex'),
    APP_ORIGIN: 'https://demo.example.test',
    BUSINESS_TIMEZONE: 'America/Hermosillo',
    BUSINESS_CURRENCY: 'USD',
    DOCUMENT_STORAGE_PATH: '/tmp/demo-test',
    LOG_LEVEL: 'fatal',
    // Supertest connects locally; this is not a suggested Render allowlist.
    TRUST_PROXY: '127.0.0.1/32,::1/128',
  };
}, 120_000);

afterAll(async () => {
  await database?.destroy();
  await postgres?.container.stop();
});

it('upgrades the old demo, preserves accounts/data, and serves the UI with secure authentication', async () => {
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
  const usersBefore = await database.selectFrom('app_user').selectAll().orderBy('id').execute();
  const stockBefore = await database
    .selectFrom('inventory_balance')
    .selectAll()
    .orderBy('product_id')
    .execute();
  const movementsBefore = await database
    .selectFrom('inventory_movement')
    .selectAll()
    .orderBy('id')
    .execute();
  await expect(
    startServer(
      { ...loadEnvironment(environment), PORT: 0 },
      {
        webDirectory: path.join(root, 'apps/web/dist'),
      },
    ),
  ).rejects.toThrow();
  await migrateToLatest(database);
  await assertDatabaseReady(database);
  // An operator changing this variable must not silently reset existing passwords.
  environment.DEMO_PASSWORD = 'a-different-startup-password';
  await seed();
  expect(await database.selectFrom('app_user').selectAll().orderBy('id').execute()).toEqual(
    usersBefore,
  );
  expect(
    await database.selectFrom('inventory_balance').selectAll().orderBy('product_id').execute(),
  ).toEqual(stockBefore);
  expect(
    await database.selectFrom('inventory_movement').selectAll().orderBy('id').execute(),
  ).toEqual(movementsBefore);
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
  // A public HTTP request is not accepted just because this is a demo.
  await request(app).get('/').expect(400);
  const html = await request(app)
    .get('/')
    .set('X-Forwarded-Proto', 'https')
    .expect('Content-Type', /html/)
    .expect(200);
  expect(html.headers['content-security-policy']).toContain("script-src 'self'");
  expect(html.headers['strict-transport-security']).toContain('max-age=31536000');
  await request(app)
    .get('/inventory')
    .set('X-Forwarded-Proto', 'https')
    .expect('Content-Type', /html/)
    .expect(200);
  await request(app).get('/assets/missing.js').set('X-Forwarded-Proto', 'https').expect(404);
  await request(app)
    .get('/api/missing')
    .set('X-Forwarded-Proto', 'https')
    .expect('Content-Type', /json/)
    .expect(404);
  await request(app).get('/api/v1/health').expect(200);
  await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-Proto', 'https')
    .set('Origin', 'https://untrusted.example.test')
    .send({ username: 'demo-admin', password: 'isolated-demo-test-password' })
    .expect(403);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-Proto', 'https')
    .set('Origin', environment.APP_ORIGIN!)
    .send({ username: 'demo-admin', password: 'isolated-demo-test-password' })
    .expect(200);
  const cookies = login.headers['set-cookie'] as unknown as string[];
  expect(cookies[0]).toContain('Secure');
  expect(cookies[0]).toContain('HttpOnly');
  await request(app)
    .get('/api/v1/auth/session')
    .set('X-Forwarded-Proto', 'https')
    .set('Cookie', cookies)
    .expect(200);
  // Document routes from main must not disappear behind the SPA fallback.
  await request(app).get('/api/v1/documents').set('X-Forwarded-Proto', 'https').expect(401);
  const driverLogin = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-Proto', 'https')
    .set('Origin', environment.APP_ORIGIN!)
    .send({ username: 'demo-driver', password: 'isolated-demo-test-password' })
    .expect(200);
  await request(app)
    .get('/api/v1/users')
    .set('X-Forwarded-Proto', 'https')
    .set('Cookie', driverLogin.headers['set-cookie'] as unknown as string[])
    .expect(403);
  const server = await startServer(
    { ...loadEnvironment(environment), PORT: 0 },
    {
      webDirectory: path.join(root, 'apps/web/dist'),
    },
  );
  try {
    await request(server).get('/inventory').set('X-Forwarded-Proto', 'https').expect(200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 60_000);

it('rejects forged forwarded HTTPS from an untrusted connection', async () => {
  const app = createServer(
    { ...loadEnvironment(environment), TRUST_PROXY: '192.0.2.1/32' },
    { database },
  );
  await request(app).get('/api/v1/auth/session').set('X-Forwarded-Proto', 'https').expect(400);
});

it('refuses a production demo startup without proxy configuration before migrations', async () => {
  const withoutProxy = { ...environment };
  delete withoutProxy.TRUST_PROXY;
  await expect(
    run(process.execPath, ['scripts/start-demo.mjs'], {
      cwd: root,
      env: withoutProxy,
    }),
  ).rejects.toMatchObject({ stderr: expect.stringContaining('Set TRUST_PROXY') });
});

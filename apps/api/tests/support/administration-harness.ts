import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { seedFoundation } from '../../../../database/seeds/001_foundation.js';
import { createDatabase } from '../../src/db/database.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import { createServer } from '../../src/server.js';
import { startPostgres } from './postgres-container.js';

export interface TestPrincipal {
  id: string;
  cookie: string;
  csrf: string;
}
export const testPrinterProfile = {
  name: 'Approved test printer',
  model: 'Test BLE',
  serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
  writeCharacteristicUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
  writeMode: 'WITH_RESPONSE',
  commandDialect: 'ESC_POS',
  paperWidthMm: 58,
  encoding: 'CP850',
  maxChunkBytes: 20,
  interChunkDelayMs: 10,
};
export async function administrationHarness() {
  const postgres = await startPostgres();
  const database = createDatabase(postgres.connectionString);
  const origin = 'https://warehouse.test';
  try {
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
  } catch (error) {
    await database.destroy();
    await postgres.container.stop();
    throw error;
  }
  const app = createServer(
    {
      NODE_ENV: 'test',
      DATABASE_URL: postgres.connectionString,
      SESSION_SECRET: 'x'.repeat(32),
      APP_ORIGIN: origin,
      BUSINESS_TIMEZONE: 'America/Hermosillo',
      BUSINESS_CURRENCY: 'MXN',
      PORT: 3000,
      LOG_LEVEL: 'fatal',
      DOCUMENT_STORAGE_PATH: '/tmp/warehouse-administration-tests',
    },
    { database },
  );
  async function login(
    username: string,
    password = 'development-password-change-me',
  ): Promise<TestPrincipal> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ username, password });
    if (response.status !== 200) throw new Error(`Fixture login failed: ${response.status}`);
    const cookies = response.headers['set-cookie'];
    const cookie = (Array.isArray(cookies) ? cookies[0]! : String(cookies)).split(';')[0]!;
    return {
      id: response.body.data.id as string,
      cookie,
      csrf: String(response.headers['x-csrf-token']),
    };
  }
  function send(
    principal: TestPrincipal | null,
    method: 'get' | 'post' | 'patch' | 'put',
    path: string,
    body?: object,
  ) {
    let test = request(app)[method](`/api/v1${path}`).set('Origin', origin);
    if (principal) test = test.set('Cookie', principal.cookie).set('X-CSRF-Token', principal.csrf);
    return body === undefined ? test : test.send(body);
  }
  return {
    database,
    app,
    login,
    send,
    close: async () => {
      await database.destroy();
      await postgres.container.stop();
    },
  };
}

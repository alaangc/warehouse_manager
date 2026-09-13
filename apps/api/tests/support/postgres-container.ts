import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

export type TestDatabase = {
  container: { stop(): Promise<unknown> };
  connectionString: string;
};

export async function startPostgres(): Promise<TestDatabase> {
  const localUrl = process.env['TEST_POSTGRES_ADMIN_URL'];
  if (localUrl) return startLocalDatabase(localUrl);
  const container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('warehouse_manager_test')
    .withUsername('warehouse_test')
    .withPassword('test-only')
    .start();

  return { container, connectionString: container.getConnectionUri() };
}

async function startLocalDatabase(connectionString: string): Promise<TestDatabase> {
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('TEST_POSTGRES_ADMIN_URL must point to a disposable local PostgreSQL server');
  }
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  const name = `warehouse_test_${randomUUID().replaceAll('-', '')}`;
  try {
    const version = await admin.query<{ server_version_num: string }>('show server_version_num');
    if (Math.floor(Number(version.rows[0]!.server_version_num) / 10_000) !== 18) {
      throw new Error('Integration tests require PostgreSQL 18');
    }
    // Only a fresh database owned by this invocation is ever migrated or dropped.
    await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  url.pathname = `/${name}`;
  return {
    connectionString: url.toString(),
    container: {
      async stop() {
        try {
          await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        } finally {
          await admin.end();
        }
      },
    },
  };
}

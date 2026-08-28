import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './types.js';

export type AppDatabase = Kysely<Database>;

export function createDatabase(connectionString: string): AppDatabase {
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  pool.on('error', (error) => {
    process.stderr.write(`Unexpected PostgreSQL pool error: ${error.message}\n`);
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

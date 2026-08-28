import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { loadEnvironment } from '../config/env.js';
import { createDatabase, type AppDatabase } from './database.js';

export async function migrateToLatest(
  database: AppDatabase,
  migrationFolder?: string,
): Promise<void> {
  const folder =
    migrationFolder ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../database/migrations');
  const migrator = new Migrator({
    db: database,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: folder }),
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    process.stdout.write(`${result.status}: ${result.migrationName}\n`);
  }
  if (error)
    throw error instanceof Error ? error : new Error('Database migration failed', { cause: error });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const environment = loadEnvironment(process.env);
  const database = createDatabase(environment.DATABASE_URL);
  try {
    await migrateToLatest(database);
  } finally {
    await database.destroy();
  }
}

import { readFile } from 'node:fs/promises';
import { sql } from 'kysely';
import type { AppDatabase } from './database.js';

// src/db and dist/db have the same depth. Ship the reviewed manifest with the API.
const manifestUrl = new URL('../../../../database/migrations/checksums.json', import.meta.url);

export async function assertDatabaseReady(database: AppDatabase): Promise<void> {
  const manifest: unknown = JSON.parse(await readFile(manifestUrl, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Invalid migration manifest');
  }
  const entries = Object.entries(manifest);
  if (
    entries.length === 0 ||
    entries.some(
      ([file, checksum]) =>
        !/^\d{3}_[a-z0-9_]+\.ts$/.test(file) ||
        typeof checksum !== 'string' ||
        !/^[a-f0-9]{64}$/.test(checksum),
    )
  )
    throw new Error('Invalid migration manifest');
  const expected = entries.map(([file]) => file.slice(0, -3)).sort();
  const { rows } = await sql<{
    name: string;
  }>`select name from public.kysely_migration order by name`.execute(database);
  if (rows.length !== expected.length || rows.some((row, index) => row.name !== expected[index])) {
    throw new Error('Database schema is incompatible with this API release');
  }
}

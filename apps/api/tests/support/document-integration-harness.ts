import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import type { AppDatabase } from '../../src/db/database.js';
import { documentHarness, type Source } from './document-harness.js';

export type DocumentIntegrationHarness = Awaited<ReturnType<typeof documentIntegrationHarness>>;

export async function documentIntegrationHarness() {
  // Every test file owns its database AND storage. Never inspect/reset developer data.
  const storage = await mkdtemp(join(tmpdir(), 'warehouse-t120-'));
  let h: Awaited<ReturnType<typeof documentHarness>>;
  try {
    h = await documentHarness({ documentStoragePath: storage });
  } catch (error) {
    await rm(storage, { recursive: true, force: true });
    throw error;
  }
  let attemptNumber = 10_000;
  async function insertDocument(
    source: Source,
    options: { id?: string; version?: string; createdAt?: string; createdBy?: string } = {},
    database: AppDatabase = h.database,
  ) {
    const id = options.id ?? randomUUID();
    // Raw SQL deliberately bypasses API checks; these columns are the design contract.
    await sql`
      insert into document_output
        (id, document_type, source_type, source_id, content_version, content_hash,
         state, created_by, created_at)
      values (${id}, ${source.documentType}, ${source.sourceType}, ${source.sourceId},
        ${options.version ?? randomUUID()}, ${'a'.repeat(64)}, 'PENDING',
        ${options.createdBy ?? h.admin.id}, ${options.createdAt ?? '2035-01-01T00:00:00.000000Z'}::timestamptz)
    `.execute(database);
    return id;
  }
  async function insertAttempt(
    options: {
      documentId?: string | null;
      documentType?: string | null;
      mode?: string;
      printerId?: string | null;
      actorId?: string;
      createdAt?: string;
    } = {},
  ) {
    const id = randomUUID();
    await sql`
      insert into output_attempt
        (id, document_output_id, document_type, actor_id, mode, printer_profile_id,
         state, attempt_number, request_id, created_at)
      values (${id}, ${options.documentId ?? null}, ${options.documentType ?? null},
        ${options.actorId ?? h.admin.id}, ${options.mode ?? 'DOWNLOAD'},
        ${options.printerId ?? null}, 'SUCCEEDED', ${attemptNumber++}, ${randomUUID()},
        ${options.createdAt ?? '2035-01-01T00:00:00.000000Z'}::timestamptz)
    `.execute(h.database);
    return id;
  }
  async function rows(table: string) {
    return (
      await sql<{ record: unknown }>`
      select to_jsonb(t) as record from ${sql.table(table)} t order by to_jsonb(t)::text
    `.execute(h.database)
    ).rows.map((row) => row.record);
  }
  async function businessState() {
    const tables = [
      'sale',
      'sale_line',
      'sale_ticket',
      'route',
      'route_load',
      'route_load_line',
      'cash_close',
      'cash_close_line',
      'cash_close_sale',
      'cash_close_current_period',
      'report_snapshot',
      'inventory_balance',
      'inventory_operation',
      'inventory_movement',
    ];
    return Object.fromEntries(
      await Promise.all(tables.map(async (table) => [table, await rows(table)])),
    );
  }
  async function storageState(directory = storage): Promise<Array<[string, string]>> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: Array<[string, string]> = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await storageState(path)));
      else
        files.push([
          path,
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        ]);
    }
    return files.sort(([a], [b]) => a.localeCompare(b));
  }
  async function outputState() {
    return {
      documents: await rows('document_output'),
      attempts: await rows('output_attempt'),
      files: await storageState(),
    };
  }
  return {
    ...h,
    storage,
    insertDocument,
    insertAttempt,
    rows,
    businessState,
    outputState,
    close: async () => {
      try {
        await h.close();
      } finally {
        await rm(storage, { recursive: true, force: true });
      }
    },
  };
}

export const historyQuery = (values: Record<string, string | number>) =>
  new URLSearchParams(
    Object.entries(values).map(([key, value]) => [key, String(value)]),
  ).toString();

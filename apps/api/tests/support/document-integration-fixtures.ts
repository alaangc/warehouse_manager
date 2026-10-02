import { sql, type Kysely } from 'kysely';
import { expect } from 'vitest';
import type { Database } from '../../src/db/types.js';
import type { documentHarness, Source } from './document-harness.js';

export type DocumentHarness = Awaited<ReturnType<typeof documentHarness>>;
type Db = Kysely<Database>;
export async function requireDocumentSchema(db: Db) {
  const result = await sql<{
    name: string | null;
  }>`select to_regclass('document_output')::text as name`.execute(db);
  expect(
    result.rows[0]?.name,
    'T123 must create document_output before constraint tests can pass',
  ).toBe('document_output');
}
export async function insertDocument(
  h: DocumentHarness,
  source: Source,
  options: {
    db?: Db;
    id?: string;
    version?: string;
    actorId?: string;
    createdAt?: string;
  } = {},
) {
  const id = options.id ?? crypto.randomUUID();
  await sql`insert into document_output
    (id, document_type, source_type, source_id, content_version, content_hash, state, created_by, created_at)
    values (${id}::uuid, ${source.documentType}, ${source.sourceType}, ${source.sourceId}::uuid,
      ${options.version ?? crypto.randomUUID()}, ${'a'.repeat(64)}, 'PENDING',
      ${options.actorId ?? h.admin.id}::uuid, ${options.createdAt ?? '2026-09-11T12:00:00Z'}::timestamptz)`.execute(
    options.db ?? h.database,
  );
  return id;
}
let attemptNumber = 100_000;
export async function insertAttempt(
  h: DocumentHarness,
  options: {
    documentId?: string | null;
    documentType?: string | null;
    mode?: string;
    printerId?: string | null;
    actorId?: string;
    createdAt?: string;
    state?: string;
  } = {},
) {
  const id = crypto.randomUUID();
  await sql`insert into output_attempt
    (id, document_output_id, document_type, actor_id, mode, printer_profile_id, state, attempt_number, request_id, created_at)
    values (${id}::uuid, ${options.documentId ?? null}::uuid, ${options.documentType ?? null},
      ${options.actorId ?? h.admin.id}::uuid, ${options.mode ?? 'DOWNLOAD'},
      ${options.printerId === undefined ? h.printerProfileId : options.printerId}::uuid,
      ${options.state ?? 'SUCCEEDED'}, ${attemptNumber++}, ${crypto.randomUUID()},
      ${options.createdAt ?? '2026-09-11T12:00:00Z'}::timestamptz)`.execute(h.database);
  return id;
}
// Snapshot complete rows, not just counts: an output retry must not rewrite amounts,
// relationships, balances, source snapshots, ledger history or source idempotency records.
const businessTables = [
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
export async function businessSnapshot(h: DocumentHarness) {
  const result: Record<string, unknown> = {};
  for (const table of businessTables) {
    const rows = await sql<{
      snapshot: unknown;
    }>`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb)::text as snapshot from ${sql.table(table)} t`.execute(
      h.database,
    );
    result[table] = rows.rows[0]!.snapshot;
  }
  result.sourceIdempotency = (
    await sql`select * from idempotency_request where id in (
    select idempotency_request_id from sale union select idempotency_request_id from cash_close
    union select idempotency_request_id from report_snapshot) order by id`.execute(h.database)
  ).rows;
  return result;
}
export async function outputSnapshot(h: DocumentHarness) {
  await requireDocumentSchema(h.database);
  const result: Record<string, unknown> = {};
  for (const table of ['document_output', 'output_attempt']) {
    result[table] = (
      await sql`select * from ${sql.table(table)} order by id`.execute(h.database)
    ).rows;
  }
  return result;
}

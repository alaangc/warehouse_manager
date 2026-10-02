import { sql } from 'kysely';
import { expect } from 'vitest';
import type { AppDatabase } from '../../src/db/database.js';
import type { Database } from '../../src/db/types.js';

// Full rows detect partial writes to derived records as well as primary records.
// Sequence counters are deliberately excluded: PostgreSQL sequences do not roll back.
export async function snapshotTables(database: AppDatabase, tables: readonly (keyof Database)[]) {
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => {
        const result = await sql<{ rows: unknown[] }>`
          select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) as rows
          from ${sql.table(table)} r
        `.execute(database);
        return [table, result.rows[0]!.rows];
      }),
    ),
  );
}

export async function rejectAudit(database: AppDatabase, command: () => Promise<unknown>) {
  await sql`
    create sequence t150_audit_attempts;
    create function t150_reject_audit() returns trigger language plpgsql as $$
    begin
      perform nextval('t150_audit_attempts');
      raise exception 'T150 injected audit failure';
    end $$;
    create trigger t150_reject_audit before insert on audit_event
    for each row execute function t150_reject_audit()
  `.execute(database);
  try {
    await expect(command()).rejects.toThrow('T150 injected audit failure');
    // This survives rollback and proves that validation/authorization was not the failure.
    const attempt = await sql<{ is_called: boolean }>`
      select is_called from t150_audit_attempts
    `.execute(database);
    expect(attempt.rows[0]!.is_called).toBe(true);
  } finally {
    await sql`
      drop trigger if exists t150_reject_audit on audit_event;
      drop function if exists t150_reject_audit();
      drop sequence if exists t150_audit_attempts
    `.execute(database);
  }
}

export async function transactionId(database: AppDatabase, table: keyof Database, id: string) {
  const result = await sql<{ xid: string }>`
    select xmin::text as xid from ${sql.table(table)} where id = ${id}::uuid
  `.execute(database);
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!.xid;
}

export async function auditForRequest(database: AppDatabase, requestId: string) {
  const events = await database
    .selectFrom('audit_event')
    .selectAll()
    .where('request_id', '=', requestId)
    .execute();
  expect(events).toHaveLength(1);
  const event = events[0]!;
  expect(event.occurred_at).toBeInstanceOf(Date);
  expect(JSON.stringify([event.before_values, event.after_values])).not.toMatch(
    /password|csrf|session|token|secret|device_handle/i,
  );
  return event;
}

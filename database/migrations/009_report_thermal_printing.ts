import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`alter table output_attempt
    drop constraint output_attempt_print_capability,
    add constraint output_attempt_print_capability check (
      mode not in ('PRINT','REPRINT') or
      (printer_profile_id is not null and document_type in ('TICKET','ROUTE_LOAD','CASH_CLOSE','REPORT'))
    )`.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // PostgreSQL refuses this change if report print history exists; preserve that history.
  await sql`alter table output_attempt
    drop constraint output_attempt_print_capability,
    add constraint output_attempt_print_capability check (
      mode not in ('PRINT','REPRINT') or
      (printer_profile_id is not null and document_type in ('TICKET','ROUTE_LOAD','CASH_CLOSE'))
    )`.execute(database);
}

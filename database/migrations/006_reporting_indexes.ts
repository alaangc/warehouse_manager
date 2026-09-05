import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`create index sale_reporting_period_idx
    on sale (completed_at, id) include (status, total, driver_id)`.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists sale_reporting_period_idx`.execute(database);
}

import { sql, type Kysely } from 'kysely';

export async function resetDatabase(database: Kysely<unknown>): Promise<void> {
  await sql`drop schema if exists public cascade`.execute(database);
  await sql`create schema public`.execute(database);
  await sql`grant all on schema public to public`.execute(database);
}

import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table credit_payment_sale drop constraint credit_payment_sale_pkey,
      add primary key (sale_id, payment_id);
  `.execute(database);
}

export async function down(): Promise<void> {
  throw new Error('Preserve partial payment history; use a roll-forward migration');
}

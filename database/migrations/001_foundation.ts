import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists pgcrypto`.execute(database);

  await database.schema
    .createTable('app_user')
    .addColumn('id', 'uuid', (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('username', 'text', (column) => column.notNull().unique())
    .addColumn('display_name', 'text', (column) => column.notNull())
    .addColumn('password_hash', 'text', (column) => column.notNull())
    .addColumn('role', 'text', (column) => column.notNull())
    .addColumn('active', 'boolean', (column) => column.notNull().defaultTo(true))
    .addColumn('archived_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('version', 'integer', (column) => column.notNull().defaultTo(1))
    .addCheckConstraint('app_user_role_check', sql`role in ('ADMINISTRATOR', 'DRIVER')`)
    .execute();
  await sql`create unique index app_user_username_normalized_uq on app_user (lower(username))`.execute(
    database,
  );

  await database.schema
    .createTable('business_setting')
    .addColumn('id', 'uuid', (column) => column.primaryKey())
    .addColumn('currency_code', sql`char(3)`, (column) => column.notNull())
    .addColumn('currency_scale', 'smallint', (column) => column.notNull().defaultTo(2))
    .addColumn('business_timezone', 'text', (column) => column.notNull())
    .addColumn('partner_share_rate', sql`numeric(9,6)`, (column) => column.notNull())
    .addColumn('money_rounding_mode', 'text', (column) => column.notNull())
    .addColumn('updated_by', 'uuid', (column) => column.references('app_user.id'))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('version', 'integer', (column) => column.notNull().defaultTo(1))
    .addCheckConstraint(
      'business_setting_singleton_check',
      sql`id = '00000000-0000-4000-8000-000000000001'::uuid`,
    )
    .addCheckConstraint('business_setting_currency_check', sql`currency_code ~ '^[A-Z]{3}$'`)
    .addCheckConstraint('business_setting_scale_check', sql`currency_scale = 2`)
    .addCheckConstraint('business_setting_partner_check', sql`partner_share_rate = 0.500000`)
    .addCheckConstraint(
      'business_setting_rounding_check',
      sql`money_rounding_mode = 'HALF_AWAY_FROM_ZERO'`,
    )
    .execute();

  await database.schema
    .createTable('auth_session')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('user_id', 'uuid', (column) =>
      column.notNull().references('app_user.id').onDelete('restrict'),
    )
    .addColumn('csrf_secret_hash', 'text', (column) => column.notNull())
    .addColumn('data', 'jsonb', (column) => column.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (column) => column.notNull())
    .addColumn('last_seen_at', 'timestamptz', (column) => column.notNull())
    .addColumn('idle_expires_at', 'timestamptz', (column) => column.notNull())
    .addColumn('absolute_expires_at', 'timestamptz', (column) => column.notNull())
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('revoked_reason', 'text')
    .execute();
  await database.schema
    .createIndex('auth_session_user_idx')
    .on('auth_session')
    .column('user_id')
    .execute();

  await database.schema
    .createTable('idempotency_request')
    .addColumn('id', 'uuid', (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('actor_id', 'uuid', (column) =>
      column.notNull().references('app_user.id').onDelete('restrict'),
    )
    .addColumn('operation_type', 'text', (column) => column.notNull())
    .addColumn('idempotency_key', 'text', (column) => column.notNull())
    .addColumn('request_hash', 'text', (column) => column.notNull())
    .addColumn('state', 'text', (column) => column.notNull())
    .addColumn('resource_type', 'text')
    .addColumn('resource_id', 'uuid')
    .addColumn('http_status', 'integer')
    .addColumn('response_snapshot', 'jsonb')
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('completed_at', 'timestamptz')
    .addUniqueConstraint('idempotency_actor_operation_key_uq', [
      'actor_id',
      'operation_type',
      'idempotency_key',
    ])
    .addCheckConstraint('idempotency_state_check', sql`state in ('IN_PROGRESS', 'COMPLETED')`)
    .execute();

  await database.schema
    .createTable('audit_event')
    .addColumn('id', 'uuid', (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('actor_id', 'uuid', (column) =>
      column.notNull().references('app_user.id').onDelete('restrict'),
    )
    .addColumn('occurred_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('action', 'text', (column) => column.notNull())
    .addColumn('entity_type', 'text', (column) => column.notNull())
    .addColumn('entity_id', 'uuid', (column) => column.notNull())
    .addColumn('reason', 'text')
    .addColumn('before_values', 'jsonb')
    .addColumn('after_values', 'jsonb')
    .addColumn('operation_id', 'uuid')
    .addColumn('request_id', 'text')
    .execute();
  await database.schema
    .createIndex('audit_event_entity_idx')
    .on('audit_event')
    .columns(['entity_type', 'entity_id', 'occurred_at'])
    .execute();

  await sql`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'warehouse_runtime') then
        create role warehouse_runtime nologin;
      end if;
      if not exists (select from pg_roles where rolname = 'warehouse_migration') then
        create role warehouse_migration nologin;
      end if;
    end $$
  `.execute(database);
  await sql`grant select, insert on audit_event to warehouse_runtime`.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable('audit_event').ifExists().execute();
  await database.schema.dropTable('idempotency_request').ifExists().execute();
  await database.schema.dropTable('auth_session').ifExists().execute();
  await database.schema.dropTable('business_setting').ifExists().execute();
  await database.schema.dropTable('app_user').ifExists().execute();
}

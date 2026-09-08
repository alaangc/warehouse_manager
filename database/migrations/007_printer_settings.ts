import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table printer_profile (
      id uuid primary key default gen_random_uuid(), name text not null, model text not null,
      transport text not null default 'WEB_BLUETOOTH_BLE' check (transport = 'WEB_BLUETOOTH_BLE'),
      service_uuid text not null, write_characteristic_uuid text not null,
      write_mode text not null check (write_mode in ('WITH_RESPONSE','WITHOUT_RESPONSE')),
      command_dialect text not null check (command_dialect = 'ESC_POS'),
      paper_width_mm integer not null check (paper_width_mm in (58,80)),
      encoding text not null check (encoding in ('CP850','CP437','UTF-8')),
      max_chunk_bytes integer not null check (max_chunk_bytes between 1 and 1024),
      inter_chunk_delay_ms integer not null check (inter_chunk_delay_ms between 0 and 5000),
      active boolean not null default true, archived_at timestamptz,
      version integer not null default 1 check (version > 0),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table user_printer_preference (
      user_id uuid primary key references app_user(id) on delete restrict,
      printer_profile_id uuid references printer_profile(id) on delete restrict,
      device_label text, tested_browser text, tested_os text,
      last_tested_at timestamptz, last_test_result text check (last_test_result in ('SUCCEEDED','FAILED','UNKNOWN')),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table output_attempt (
      id uuid primary key default gen_random_uuid(),
      document_output_id uuid, document_type text,
      actor_id uuid not null references app_user(id) on delete restrict,
      mode text not null, printer_profile_id uuid references printer_profile(id) on delete restrict,
      state text not null check (state in ('STARTED','SUCCEEDED','FAILED','UNKNOWN')),
      error_code text, attempt_number integer not null check (attempt_number > 0), request_id text not null,
      created_at timestamptz not null default now(),
      unique (actor_id, printer_profile_id, attempt_number),
      -- Document modes stay closed until the DocumentOutput migration adds its FK.
      constraint output_attempt_test_only check (mode = 'TEST_PRINT'),
      constraint output_attempt_test_shape check (
        printer_profile_id is not null and document_output_id is null and document_type is null
      )
    );
    create index output_attempt_history_idx on output_attempt (created_at desc, id desc);
    create index output_attempt_printer_idx on output_attempt (printer_profile_id, created_at desc);
    create function protect_output_attempt() returns trigger language plpgsql as $$
    begin raise exception 'Output attempts are append-only'; end $$;
    create trigger output_attempt_immutable before update or delete on output_attempt
      for each row execute function protect_output_attempt();
    grant select, insert, update on printer_profile, user_printer_preference to warehouse_runtime;
    grant select, insert on output_attempt to warehouse_runtime;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop table output_attempt;
    drop function protect_output_attempt();
    drop table user_printer_preference;
    drop table printer_profile;
  `.execute(database);
}

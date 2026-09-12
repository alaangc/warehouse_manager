import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table document_output (
      id uuid primary key default gen_random_uuid(),
      document_type text not null, source_type text not null, source_id uuid not null,
      content_version text not null check (length(btrim(content_version)) > 0),
      content_hash text not null, storage_key text,
      state text not null default 'PENDING' check (state in ('PENDING','READY','FAILED')),
      created_by uuid not null references app_user(id) on delete restrict,
      created_at timestamptz not null default now(), ready_at timestamptz, last_error_code text,
      constraint document_output_source_pair check (
        (document_type = 'TICKET' and source_type = 'SALE') or
        (document_type = 'ROUTE_LOAD' and source_type = 'ROUTE_LOAD') or
        (document_type = 'CASH_CLOSE' and source_type = 'CASH_CLOSE') or
        (document_type = 'REPORT' and source_type = 'REPORT_SNAPSHOT')
      ),
      -- Generated projections keep polymorphic references under real foreign keys.
      sale_id uuid generated always as
        (case when source_type = 'SALE' then source_id end) stored
        references sale(id) on delete restrict,
      route_load_id uuid generated always as
        (case when source_type = 'ROUTE_LOAD' then source_id end) stored
        references route_load(id) on delete restrict,
      cash_close_id uuid generated always as
        (case when source_type = 'CASH_CLOSE' then source_id end) stored
        references cash_close(id) on delete restrict,
      report_snapshot_id uuid generated always as
        (case when source_type = 'REPORT_SNAPSHOT' then source_id end) stored
        references report_snapshot(id) on delete restrict,
      unique (document_type, source_type, source_id, content_version),
      unique (id, document_type)
    );
    create index document_output_history_idx on document_output (created_at desc, id desc);
    create index document_output_type_state_idx on document_output
      (document_type, state, created_at desc, id desc);
    create index document_output_source_idx on document_output
      (source_type, source_id, created_at desc, id desc);

    create function require_confirmed_document_load() returns trigger language plpgsql as $$
    declare load_state text;
    begin
      if new.source_type = 'ROUTE_LOAD' then
        -- FOR UPDATE conflicts with confirmation/state updates, not only deletion.
        select state into load_state from route_load where id = new.source_id for update;
        if not found then
          raise exception 'Document source does not exist' using errcode = '23503';
        end if;
        if load_state <> 'CONFIRMED' then
          raise exception 'Document route load must be confirmed' using errcode = '23514';
        end if;
      end if;
      return new;
    end $$;
    create constraint trigger document_output_confirmed_load
      after insert or update on document_output
      for each row execute function require_confirmed_document_load();

    alter table output_attempt
      drop constraint output_attempt_test_only,
      drop constraint output_attempt_test_shape,
      add constraint output_attempt_document_fk foreign key (document_output_id, document_type)
        references document_output(id, document_type) on delete restrict,
      add constraint output_attempt_mode_check check
        (mode in ('GENERATE','DOWNLOAD','SHARE','PRINT','REPRINT','TEST_PRINT')),
      add constraint output_attempt_document_shape check (
        (mode = 'TEST_PRINT' and document_output_id is null and document_type is null
          and printer_profile_id is not null) or
        (mode <> 'TEST_PRINT' and document_output_id is not null and document_type is not null)
      ),
      add constraint output_attempt_print_capability check (
        mode not in ('PRINT','REPRINT') or
        (printer_profile_id is not null and document_type in ('TICKET','ROUTE_LOAD','CASH_CLOSE'))
      );
    create index output_attempt_document_history_idx on output_attempt
      (document_output_id, created_at desc, id desc);
    grant select, insert on document_output to warehouse_runtime;
    grant update (content_hash, storage_key, state, ready_at, last_error_code)
      on document_output to warehouse_runtime;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // Refuse rollback once document history exists; never erase the immutable ledger.
  await sql`
    do $$ begin
      if exists (select 1 from document_output) or
         exists (select 1 from output_attempt where mode <> 'TEST_PRINT') then
        raise exception 'Document history exists; use a roll-forward migration';
      end if;
    end $$;
    drop index output_attempt_document_history_idx;
    alter table output_attempt
      drop constraint output_attempt_document_fk,
      drop constraint output_attempt_mode_check,
      drop constraint output_attempt_document_shape,
      drop constraint output_attempt_print_capability,
      add constraint output_attempt_test_only check (mode = 'TEST_PRINT'),
      add constraint output_attempt_test_shape check (
        printer_profile_id is not null and document_output_id is null and document_type is null
      );
    drop table document_output;
    drop function require_confirmed_document_load();
  `.execute(database);
}

import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table cash_close (
      id uuid primary key default gen_random_uuid(),
      close_number text not null unique,
      period_kind text not null,
      anchor_date date not null,
      business_timezone text not null,
      period_start timestamptz not null,
      period_end timestamptz not null,
      currency_code char(3) not null,
      gross_total numeric(19,2) not null,
      partner_rate numeric(9,6) not null,
      partner_amount numeric(19,2) not null,
      remaining_amount numeric(19,2) not null,
      rounding_mode text not null,
      created_by uuid not null references app_user(id) on delete restrict,
      idempotency_request_id uuid not null unique references idempotency_request(id) on delete restrict,
      supersedes_cash_close_id uuid unique references cash_close(id) on delete restrict,
      correction_reason text,
      created_at timestamptz not null default now(),
      constraint cash_close_period_kind_check check (period_kind in ('DAY','WEEK','MONTH')),
      constraint cash_close_period_bounds_check check (period_end > period_start),
      constraint cash_close_timezone_not_blank check (nullif(btrim(business_timezone), '') is not null),
      constraint cash_close_currency_check check (currency_code ~ '^[A-Z]{3}$'),
      constraint cash_close_amounts_check check (
        gross_total >= 0 and partner_rate >= 0 and partner_rate <= 1 and
        partner_amount >= 0 and remaining_amount >= 0 and
        gross_total = partner_amount + remaining_amount
      ),
      constraint cash_close_rounding_check check (rounding_mode = 'HALF_AWAY_FROM_ZERO'),
      constraint cash_close_correction_pair_check check (
        (supersedes_cash_close_id is null and correction_reason is null) or
        (supersedes_cash_close_id is not null and nullif(btrim(correction_reason), '') is not null)
      ),
      constraint cash_close_period_identity_uq unique
        (id, business_timezone, period_start, period_end)
    );
    create index cash_close_period_history_idx
      on cash_close (business_timezone, period_start, period_end, created_at desc, id desc);
    create index cash_close_created_idx on cash_close (created_at desc, id desc);

    create table cash_close_line (
      id uuid primary key default gen_random_uuid(),
      cash_close_id uuid not null references cash_close(id) on delete restrict,
      reporting_group text not null,
      total numeric(19,2) not null,
      constraint cash_close_line_group_check check (
        reporting_group in ('SODAS','CHARCOAL','TOSTADAS','OTHER')
      ),
      constraint cash_close_line_total_check check (total >= 0),
      unique (cash_close_id, reporting_group)
    );

    create table cash_close_sale (
      cash_close_id uuid not null references cash_close(id) on delete restrict,
      sale_id uuid not null references sale(id) on delete restrict,
      included_amount numeric(19,2) not null,
      constraint cash_close_sale_amount_check check (included_amount >= 0),
      primary key (cash_close_id, sale_id)
    );
    create index cash_close_sale_sale_idx on cash_close_sale (sale_id, cash_close_id);

    create table cash_close_current_period (
      business_timezone text not null,
      period_start timestamptz not null,
      period_end timestamptz not null,
      current_cash_close_id uuid not null unique,
      constraint cash_close_current_period_bounds_check check (period_end > period_start),
      constraint cash_close_current_period_pk primary key
        (business_timezone, period_start, period_end),
      constraint cash_close_current_period_target_fk foreign key
        (current_cash_close_id, business_timezone, period_start, period_end)
        references cash_close (id, business_timezone, period_start, period_end)
        on delete restrict
    );

    create table report_snapshot (
      id uuid primary key default gen_random_uuid(),
      report_type text not null,
      filters jsonb not null,
      business_timezone text not null,
      source_watermark text not null,
      result jsonb not null,
      created_by uuid not null references app_user(id) on delete restrict,
      idempotency_request_id uuid not null unique references idempotency_request(id) on delete restrict,
      created_at timestamptz not null default now(),
      constraint report_snapshot_type_check check (
        report_type in ('SALES_BY_DRIVER','BEST_SELLING_PRODUCTS','INVENTORY_BY_BRANCH','FINANCIAL_SUMMARY')
      ),
      constraint report_snapshot_timezone_not_blank check (
        nullif(btrim(business_timezone), '') is not null
      ),
      constraint report_snapshot_watermark_not_blank check (
        nullif(btrim(source_watermark), '') is not null
      ),
      constraint report_snapshot_filters_object_check check (jsonb_typeof(filters) = 'object'),
      constraint report_snapshot_result_object_check check (jsonb_typeof(result) = 'object')
    );
    create index report_snapshot_created_idx on report_snapshot (created_at desc, id desc);
    create index report_snapshot_type_created_idx
      on report_snapshot (report_type, created_at desc, id desc);

    create function enforce_cash_close_correction_period() returns trigger language plpgsql as $$
    declare
      predecessor cash_close%rowtype;
    begin
      if new.supersedes_cash_close_id is null then
        return new;
      end if;

      select * into predecessor
      from cash_close
      where id = new.supersedes_cash_close_id;

      if not found then
        raise exception using
          errcode = '23503',
          message = 'cash-close predecessor does not exist';
      end if;

      if predecessor.period_kind is distinct from new.period_kind
        or predecessor.anchor_date is distinct from new.anchor_date
        or predecessor.business_timezone is distinct from new.business_timezone
        or predecessor.period_start is distinct from new.period_start
        or predecessor.period_end is distinct from new.period_end then
        raise exception using
          errcode = '23514',
          message = 'cash-close correction must preserve the exact reporting period';
      end if;

      if exists (
        select 1 from cash_close successor
        where successor.supersedes_cash_close_id = new.supersedes_cash_close_id
          and successor.id <> new.id
      ) then
        raise exception using
          errcode = '23505',
          message = 'cash-close history cannot branch';
      end if;

      return new;
    end $$;
    create constraint trigger cash_close_correction_period_guard
      after insert on cash_close
      deferrable initially immediate
      for each row execute function enforce_cash_close_correction_period();

    create function prevent_reporting_history_change() returns trigger language plpgsql as $$
    begin
      raise exception using
        errcode = '55000',
        message = format('immutable reporting history cannot change: %s', tg_table_name);
    end $$;
    create trigger cash_close_immutable before update or delete on cash_close
      for each row execute function prevent_reporting_history_change();
    create trigger cash_close_line_immutable before update or delete on cash_close_line
      for each row execute function prevent_reporting_history_change();
    create trigger cash_close_sale_immutable before update or delete on cash_close_sale
      for each row execute function prevent_reporting_history_change();
    create trigger report_snapshot_immutable before update or delete on report_snapshot
      for each row execute function prevent_reporting_history_change();

    revoke update, delete on cash_close, cash_close_line, cash_close_sale, report_snapshot
      from warehouse_runtime;
    grant select, insert on cash_close, cash_close_line, cash_close_sale, report_snapshot
      to warehouse_runtime;
    grant select, insert, update on cash_close_current_period to warehouse_runtime;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop table if exists report_snapshot;
    drop table if exists cash_close_current_period;
    drop table if exists cash_close_sale;
    drop table if exists cash_close_line;
    drop table if exists cash_close;
    drop function if exists prevent_reporting_history_change();
    drop function if exists enforce_cash_close_correction_period();
  `.execute(database);
}

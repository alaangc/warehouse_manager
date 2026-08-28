import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`create extension if not exists btree_gist`.execute(database);
  await sql`
    create table customer (
      id uuid primary key default gen_random_uuid(), customer_number text not null unique,
      display_name text not null, contact_name text, phone text, email text, address text, city text not null, notes text,
      active boolean not null default true, archived_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
    );
    create index customer_search_idx on customer (lower(display_name), lower(customer_number));

    create table customer_price (
      id uuid primary key default gen_random_uuid(), customer_id uuid not null references customer(id) on delete restrict,
      product_id uuid not null references product(id) on delete restrict, unit_price numeric(19,4) not null,
      valid_from timestamptz not null, valid_to timestamptz, active boolean not null default true,
      created_by uuid not null references app_user(id) on delete restrict, created_at timestamptz not null default now(),
      valid_period tstzrange generated always as (tstzrange(valid_from, valid_to, '[)')) stored,
      constraint customer_price_nonnegative check (unit_price >= 0),
      constraint customer_price_end_check check (valid_to is null or valid_to > valid_from),
      constraint customer_price_active_no_overlap exclude using gist
        (customer_id with =, product_id with =, valid_period with &&) where (active)
    );

    create table sale (
      id uuid primary key default gen_random_uuid(), sale_number text not null unique, client_operation_id uuid not null unique,
      status text not null default 'COMPLETED', customer_id uuid not null references customer(id) on delete restrict,
      driver_id uuid not null references app_user(id) on delete restrict, route_id uuid not null references route(id) on delete restrict,
      origin_location_id uuid not null references location(id) on delete restrict, payment_method text not null,
      currency_code char(3) not null, subtotal numeric(19,2) not null, total numeric(19,2) not null,
      rounding_mode text not null, completed_at timestamptz not null default now(),
      inventory_operation_id uuid not null unique references inventory_operation(id) on delete restrict,
      idempotency_request_id uuid not null unique references idempotency_request(id) on delete restrict,
      cancelled_at timestamptz, cancelled_by uuid references app_user(id) on delete restrict, cancellation_reason text,
      constraint sale_status_check check (status in ('COMPLETED','CANCELLED')),
      constraint sale_payment_check check (payment_method in ('CASH','BANK_TRANSFER','CARD')),
      constraint sale_amount_check check (subtotal >= 0 and total >= 0),
      constraint sale_cancel_state_check check (
        (status = 'COMPLETED' and cancelled_at is null and cancelled_by is null and cancellation_reason is null) or
        (status = 'CANCELLED' and cancelled_at is not null and cancelled_by is not null and nullif(btrim(cancellation_reason),'') is not null)
      )
    );

    create table sale_line (
      id uuid primary key default gen_random_uuid(), sale_id uuid not null references sale(id) on delete restrict,
      sequence integer not null, product_id uuid not null references product(id) on delete restrict,
      customer_price_id uuid references customer_price(id) on delete restrict,
      product_name text not null, category_name text not null, reporting_group text not null, unit_code text not null,
      quantity numeric(18,3) not null, unit_price numeric(19,4) not null, line_amount numeric(19,2) not null,
      applied_price_source text not null,
      constraint sale_line_quantity_check check (quantity > 0),
      constraint sale_line_amount_check check (unit_price >= 0 and line_amount >= 0),
      constraint sale_line_source_check check (applied_price_source in ('CUSTOMER','STANDARD')),
      unique(sale_id, sequence), unique(sale_id, product_id)
    );

    create table sale_ticket (
      id uuid primary key default gen_random_uuid(), ticket_number text not null unique,
      sale_id uuid not null unique references sale(id) on delete restrict,
      printable_snapshot jsonb not null, content_version text not null, created_at timestamptz not null default now()
    );

    create table sale_cancellation (
      id uuid primary key default gen_random_uuid(), sale_id uuid not null unique references sale(id) on delete restrict,
      actor_id uuid not null references app_user(id) on delete restrict, reason text not null,
      destination_stock_location_id uuid not null references stock_location(id) on delete restrict,
      inventory_operation_id uuid not null unique references inventory_operation(id) on delete restrict,
      idempotency_request_id uuid not null unique references idempotency_request(id) on delete restrict,
      created_at timestamptz not null default now(), constraint sale_cancellation_reason_check check (nullif(btrim(reason),'') is not null)
    );

    create function prevent_sale_history_change() returns trigger language plpgsql as $$
    begin raise exception 'immutable sale history cannot be changed'; end $$;
    create trigger sale_line_immutable before update or delete on sale_line for each row execute function prevent_sale_history_change();
    create trigger sale_ticket_immutable before update or delete on sale_ticket for each row execute function prevent_sale_history_change();
    revoke update, delete on sale_line, sale_ticket, sale_cancellation from warehouse_runtime;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop table if exists sale_cancellation cascade;
    drop table if exists sale_ticket cascade;
    drop table if exists sale_line cascade;
    drop table if exists sale cascade;
    drop table if exists customer_price cascade;
    drop table if exists customer cascade;
    drop function if exists prevent_sale_history_change();
  `.execute(database);
}

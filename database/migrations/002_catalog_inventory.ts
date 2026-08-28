import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table location (
      id uuid primary key default gen_random_uuid(), code text not null, name text not null,
      active boolean not null default true, archived_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
      constraint location_code_not_blank check (btrim(code) <> ''), constraint location_name_not_blank check (btrim(name) <> '')
    );
    create unique index location_code_normalized_uq on location (upper(btrim(code)));

    create table category (
      id uuid primary key default gen_random_uuid(), name text not null, reporting_group text not null,
      active boolean not null default true, archived_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
      constraint category_group_check check (reporting_group in ('SODAS','CHARCOAL','TOSTADAS','OTHER'))
    );
    create unique index category_name_normalized_uq on category (lower(btrim(name)));

    create table unit (
      id uuid primary key default gen_random_uuid(), code text not null, name text not null, quantity_scale smallint not null,
      active boolean not null default true, archived_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
      constraint unit_scale_check check (quantity_scale between 0 and 3)
    );
    create unique index unit_code_normalized_uq on unit (upper(btrim(code)));

    create table product (
      id uuid primary key default gen_random_uuid(), sku text not null, name text not null, description text,
      category_id uuid not null references category(id) on delete restrict,
      unit_id uuid not null references unit(id) on delete restrict,
      standard_unit_price numeric(19,4) not null, low_stock_threshold numeric(18,3) not null,
      active boolean not null default true, archived_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
      constraint product_price_nonnegative check (standard_unit_price >= 0),
      constraint product_threshold_nonnegative check (low_stock_threshold >= 0)
    );
    create unique index product_sku_normalized_uq on product (upper(btrim(sku)));
    create index product_search_idx on product (lower(name), lower(sku));

    create table vehicle (
      id uuid primary key default gen_random_uuid(), code text not null, name text not null, registration text,
      active boolean not null default true, archived_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
    );
    create unique index vehicle_code_normalized_uq on vehicle (upper(btrim(code)));

    create table route (
      id uuid primary key default gen_random_uuid(), route_number text not null unique,
      state text not null default 'PREPARING', origin_location_id uuid not null references location(id) on delete restrict,
      driver_id uuid not null references app_user(id) on delete restrict, vehicle_id uuid not null references vehicle(id) on delete restrict,
      business_date date not null, created_by uuid not null references app_user(id) on delete restrict,
      created_at timestamptz not null default now(), started_at timestamptz, returned_at timestamptz, closed_at timestamptz,
      closed_by uuid references app_user(id) on delete restrict, version integer not null default 1,
      constraint route_state_check check (state in ('PREPARING','EN_ROUTE','RETURNED','CLOSED'))
    );
    create unique index route_active_driver_uq on route (driver_id) where state in ('PREPARING','EN_ROUTE','RETURNED');
    create unique index route_active_vehicle_uq on route (vehicle_id) where state in ('PREPARING','EN_ROUTE','RETURNED');

    create table stock_location (
      id uuid primary key default gen_random_uuid(), kind text not null,
      branch_id uuid unique references location(id) on delete restrict, route_id uuid unique references route(id) on delete restrict,
      constraint stock_location_kind_check check (
        (kind = 'BRANCH' and branch_id is not null and route_id is null) or
        (kind = 'ROUTE' and route_id is not null and branch_id is null)
      )
    );
    insert into stock_location (kind, branch_id) select 'BRANCH', id from location;

    create table inventory_balance (
      id uuid primary key default gen_random_uuid(), stock_location_id uuid not null references stock_location(id) on delete restrict,
      product_id uuid not null references product(id) on delete restrict, quantity numeric(18,3) not null default 0,
      updated_at timestamptz not null default now(), version integer not null default 1,
      constraint inventory_balance_nonnegative check (quantity >= 0), unique(stock_location_id, product_id)
    );

    create table inventory_operation (
      id uuid primary key default gen_random_uuid(), operation_type text not null, actor_id uuid not null references app_user(id) on delete restrict,
      reason text, related_entity_type text not null, related_entity_id uuid not null,
      idempotency_request_id uuid unique references idempotency_request(id) on delete restrict,
      occurred_at timestamptz not null default now(), reverses_operation_id uuid unique references inventory_operation(id) on delete restrict,
      constraint inventory_operation_type_check check (operation_type in (
        'ENTRY','MANUAL_EXIT','TRANSFER','ROUTE_LOAD','SALE','ROUTE_RETURN','POSITIVE_ADJUSTMENT','NEGATIVE_ADJUSTMENT','SALE_CANCELLATION'
      )),
      constraint inventory_operation_reason_check check (
        operation_type not in ('MANUAL_EXIT','POSITIVE_ADJUSTMENT','NEGATIVE_ADJUSTMENT','SALE_CANCELLATION') or nullif(btrim(reason),'') is not null
      )
    );

    create table inventory_movement (
      id uuid primary key default gen_random_uuid(), operation_id uuid not null references inventory_operation(id) on delete restrict,
      product_id uuid not null references product(id) on delete restrict,
      source_stock_location_id uuid references stock_location(id) on delete restrict,
      destination_stock_location_id uuid references stock_location(id) on delete restrict,
      quantity numeric(18,3) not null, source_balance_after numeric(18,3), destination_balance_after numeric(18,3),
      actor_id uuid not null references app_user(id) on delete restrict, occurred_at timestamptz not null default now(), reason text,
      related_entity_type text not null, related_entity_id uuid not null,
      reverses_movement_id uuid unique references inventory_movement(id) on delete restrict,
      constraint inventory_movement_quantity_positive check (quantity > 0),
      constraint inventory_movement_endpoints_check check (
        (source_stock_location_id is not null or destination_stock_location_id is not null) and
        source_stock_location_id is distinct from destination_stock_location_id and
        (source_stock_location_id is null) = (source_balance_after is null) and
        (destination_stock_location_id is null) = (destination_balance_after is null)
      )
    );
    create index inventory_movement_history_idx on inventory_movement (occurred_at desc, id desc);
    create index inventory_movement_product_idx on inventory_movement (product_id, occurred_at desc);

    create function prevent_immutable_ledger_change() returns trigger language plpgsql as $$
    begin raise exception 'immutable ledger rows cannot be changed'; end $$;
    create trigger inventory_movement_immutable before update or delete on inventory_movement
      for each row execute function prevent_immutable_ledger_change();
    revoke update, delete on inventory_movement from warehouse_runtime;
    grant select, insert on inventory_movement, inventory_operation to warehouse_runtime;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop table if exists inventory_movement cascade;
    drop table if exists inventory_operation cascade;
    drop table if exists inventory_balance cascade;
    drop table if exists stock_location cascade;
    drop table if exists route cascade;
    drop table if exists vehicle cascade;
    drop table if exists product cascade;
    drop table if exists unit cascade;
    drop table if exists category cascade;
    drop table if exists location cascade;
    drop function if exists prevent_immutable_ledger_change();
  `.execute(database);
}

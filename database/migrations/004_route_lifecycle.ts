import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table route_load (
      id uuid primary key default gen_random_uuid(), route_id uuid not null unique references route(id) on delete restrict,
      state text not null default 'DRAFT', recorded_by uuid not null references app_user(id) on delete restrict,
      confirmed_at timestamptz, inventory_operation_id uuid unique references inventory_operation(id) on delete restrict,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
      constraint route_load_state_check check (state in ('DRAFT','CONFIRMED')),
      constraint route_load_confirmation_check check (
        (state = 'DRAFT' and confirmed_at is null and inventory_operation_id is null) or
        (state = 'CONFIRMED' and confirmed_at is not null and inventory_operation_id is not null)
      )
    );
    create table route_load_line (
      id uuid primary key default gen_random_uuid(), route_load_id uuid not null references route_load(id) on delete restrict,
      product_id uuid not null references product(id) on delete restrict, quantity numeric(18,3) not null,
      product_name text not null, unit_code text not null, quantity_scale smallint not null,
      constraint route_load_line_quantity_check check (quantity > 0), unique(route_load_id, product_id)
    );
    create table route_reconciliation (
      id uuid primary key default gen_random_uuid(), route_id uuid not null unique references route(id) on delete restrict,
      state text not null default 'DRAFT', recorded_by uuid not null references app_user(id) on delete restrict,
      approved_by uuid references app_user(id) on delete restrict, approved_at timestamptz,
      return_operation_id uuid unique references inventory_operation(id) on delete restrict,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
      constraint route_reconciliation_state_check check (state in ('DRAFT','APPROVED')),
      constraint route_reconciliation_approval_check check (
        (state = 'DRAFT' and approved_by is null and approved_at is null and return_operation_id is null) or
        (state = 'APPROVED' and approved_by is not null and approved_at is not null and return_operation_id is not null)
      )
    );
    create table route_reconciliation_line (
      id uuid primary key default gen_random_uuid(), route_reconciliation_id uuid not null references route_reconciliation(id) on delete restrict,
      product_id uuid not null references product(id) on delete restrict, loaded_quantity numeric(18,3) not null,
      sold_quantity numeric(18,3) not null, expected_return_quantity numeric(18,3) not null,
      physical_return_quantity numeric(18,3) not null, difference_quantity numeric(18,3) not null,
      difference_reason text, adjustment_movement_id uuid references inventory_movement(id) on delete restrict,
      product_name text not null, unit_code text not null,
      constraint reconciliation_quantities_check check (loaded_quantity >= 0 and sold_quantity >= 0 and expected_return_quantity >= 0 and physical_return_quantity >= 0),
      constraint reconciliation_identity_check check (loaded_quantity = sold_quantity + physical_return_quantity + difference_quantity),
      constraint reconciliation_reason_check check ((difference_quantity = 0 and difference_reason is null and adjustment_movement_id is null) or (difference_quantity <> 0 and nullif(btrim(difference_reason),'') is not null and adjustment_movement_id is not null)),
      unique(route_reconciliation_id, product_id)
    );

    create function protect_confirmed_route_data() returns trigger language plpgsql as $$
    begin
      if exists(select 1 from route_load where id = coalesce(old.route_load_id, new.route_load_id) and state = 'CONFIRMED') then
        raise exception 'confirmed route load is immutable';
      end if;
      return coalesce(new, old);
    end $$;
    create trigger route_load_line_confirmed_immutable before update or delete on route_load_line for each row execute function protect_confirmed_route_data();
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    drop table if exists route_reconciliation_line cascade;
    drop table if exists route_reconciliation cascade;
    drop table if exists route_load_line cascade;
    drop table if exists route_load cascade;
    drop function if exists protect_confirmed_route_data();
  `.execute(database);
}

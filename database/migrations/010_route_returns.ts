import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table route_return (
      id uuid primary key default gen_random_uuid(),
      route_id uuid not null references route(id) on delete restrict,
      kind text not null check (kind in ('DECLARED', 'APPROVED')),
      recorded_by uuid not null references app_user(id) on delete restrict,
      created_at timestamptz not null default now(),
      snapshot jsonb not null,
      unique(route_id, kind)
    );
    insert into route_return(id, route_id, kind, recorded_by, created_at, snapshot)
      select rec.id, rec.route_id, 'APPROVED', rec.recorded_by, rec.approved_at,
        jsonb_build_object('routeNumber', r.route_number, 'kind', 'APPROVED', 'lines',
          (select jsonb_agg(jsonb_build_object(
            'productId', l.product_id, 'productName', l.product_name, 'unitCode', l.unit_code,
            'quantity', l.physical_return_quantity::text, 'expectedQuantity', l.expected_return_quantity::text,
            'differenceQuantity', l.difference_quantity::text, 'differenceReason', l.difference_reason
          ) order by l.product_id) from route_reconciliation_line l where l.route_reconciliation_id = rec.id))
      from route_reconciliation rec join route r on r.id = rec.route_id;
    create trigger route_return_immutable before update or delete on route_return
      for each row execute function prevent_immutable_ledger_change();
    grant select, insert on route_return to warehouse_runtime;
    alter table document_output drop constraint document_output_source_pair,
      add constraint document_output_source_pair check (
        (document_type = 'TICKET' and source_type = 'SALE') or
        (document_type = 'ROUTE_LOAD' and source_type = 'ROUTE_LOAD') or
        (document_type = 'ROUTE_RETURN' and source_type = 'ROUTE_RETURN') or
        (document_type = 'CASH_CLOSE' and source_type = 'CASH_CLOSE') or
        (document_type = 'REPORT' and source_type = 'REPORT_SNAPSHOT')
      ),
      add column route_return_id uuid generated always as
        (case when source_type = 'ROUTE_RETURN' then source_id end) stored
        references route_return(id) on delete restrict;
    alter table output_attempt drop constraint output_attempt_print_capability,
      add constraint output_attempt_print_capability check (
        mode not in ('PRINT','REPRINT') or
        (printer_profile_id is not null and document_type in
          ('TICKET','ROUTE_LOAD','ROUTE_RETURN','CASH_CLOSE','REPORT'))
      );
  `.execute(database);
}

export async function down(): Promise<void> {
  throw new Error('Route return history must be preserved; use a roll-forward migration');
}

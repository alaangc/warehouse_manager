import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    -- Existing amounts already represent USD. No exchange conversion is performed.
    update business_setting set currency_code = 'USD';
    alter table business_setting add constraint business_setting_usd_check check (currency_code = 'USD');
    alter table sale add column legacy_sale_number text;
    update sale set legacy_sale_number = sale_number;
    with numbered as (
      select id, row_number() over (order by completed_at, id) as n from sale
    ) update sale s set sale_number = 'Nota: ' || lpad(n::text, greatest(3, length(n::text)), '0'),
      currency_code = 'USD' from numbered where s.id = numbered.id;
    create table sale_note_counter (id integer primary key check (id = 1), value bigint not null);
    insert into sale_note_counter select 1, count(*) from sale;
    grant select, update on sale_note_counter to warehouse_runtime;
    create table credit_payment_counter (id integer primary key check (id = 1), value bigint not null);
    insert into credit_payment_counter values (1, 0);
    grant select, update on credit_payment_counter to warehouse_runtime;
    alter table sale drop constraint sale_payment_check,
      add constraint sale_payment_check check (payment_method in ('CASH','BANK_TRANSFER','CARD','CHECK','CREDIT'));
    alter table sale_ticket disable trigger sale_ticket_immutable;
    alter table sale_ticket add column legacy_ticket_number text;
    update sale_ticket set legacy_ticket_number = ticket_number;
    update sale_ticket t set printable_snapshot = t.printable_snapshot ||
      jsonb_build_object('saleNumber', s.sale_number, 'ticketNumber', s.sale_number, 'currencyCode', 'USD'),
      ticket_number = s.sale_number,
      content_version = '2' from sale s where t.sale_id = s.id;
    alter table sale_ticket enable trigger sale_ticket_immutable;
    update idempotency_request i set response_snapshot = i.response_snapshot ||
      jsonb_build_object('saleNumber', s.sale_number, 'ticketNumber', s.sale_number, 'currencyCode', 'USD')
      from sale s where i.resource_id = s.id and i.operation_type = 'SALE_CONFIRMATION';
    update idempotency_request set response_snapshot = jsonb_set(response_snapshot, '{currencyCode}', '"USD"'::jsonb)
      where response_snapshot ->> 'currencyCode' = 'MXN';
    update idempotency_request set response_snapshot = jsonb_set(response_snapshot, '{totals,currencyCode}', '"USD"'::jsonb)
      where response_snapshot #>> '{totals,currencyCode}' = 'MXN';
    update idempotency_request set response_snapshot = jsonb_set(response_snapshot, '{result,totals,currencyCode}', '"USD"'::jsonb)
      where response_snapshot #>> '{result,totals,currencyCode}' = 'MXN';
    alter table cash_close disable trigger cash_close_immutable;
    update cash_close set currency_code = 'USD';
    alter table cash_close enable trigger cash_close_immutable;
    alter table report_snapshot disable trigger report_snapshot_immutable;
    update report_snapshot set result = jsonb_set(result, '{totals,currencyCode}', '"USD"'::jsonb)
      where result #> '{totals,currencyCode}' is not null;
    alter table report_snapshot enable trigger report_snapshot_immutable;
    update document_output set state = 'FAILED', storage_key = null, ready_at = null,
      last_error_code = 'DOCUMENT_REGENERATION_REQUIRED'
      where document_type in ('TICKET','CASH_CLOSE','REPORT');

    create table credit_payment (
      id uuid primary key default gen_random_uuid(),
      customer_id uuid not null references customer(id),
      receipt_number text not null unique,
      payment_method text not null check (payment_method in ('CASH','BANK_TRANSFER','CHECK')),
      total numeric(19,2) not null check (total >= 0), currency_code char(3) not null check (currency_code = 'USD'),
      created_by uuid not null references app_user(id), created_at timestamptz not null default now(),
      idempotency_request_id uuid not null unique references idempotency_request(id),
      snapshot jsonb not null
    );
    create table credit_payment_sale (
      sale_id uuid primary key references sale(id),
      payment_id uuid not null references credit_payment(id),
      amount numeric(19,2) not null check (amount >= 0)
    );
    create index credit_payment_customer_idx on credit_payment(customer_id, created_at desc);
    create index sale_credit_customer_idx on sale(customer_id, completed_at) where payment_method = 'CREDIT';
    create trigger credit_payment_immutable before update or delete on credit_payment
      for each row execute function prevent_immutable_ledger_change();
    create trigger credit_payment_sale_immutable before update or delete on credit_payment_sale
      for each row execute function prevent_immutable_ledger_change();
    grant select, insert on credit_payment, credit_payment_sale to warehouse_runtime;
    alter table document_output drop constraint document_output_source_pair,
      add constraint document_output_source_pair check (
        (document_type = 'TICKET' and source_type = 'SALE') or
        (document_type = 'CREDIT_RECEIPT' and source_type = 'CREDIT_PAYMENT') or
        (document_type = 'ROUTE_LOAD' and source_type = 'ROUTE_LOAD') or
        (document_type = 'ROUTE_RETURN' and source_type = 'ROUTE_RETURN') or
        (document_type = 'CASH_CLOSE' and source_type = 'CASH_CLOSE') or
        (document_type = 'REPORT' and source_type = 'REPORT_SNAPSHOT')
      ),
      add column credit_payment_id uuid generated always as
        (case when source_type = 'CREDIT_PAYMENT' then source_id end) stored references credit_payment(id);
    alter table output_attempt drop constraint output_attempt_print_capability,
      add constraint output_attempt_print_capability check (
        mode not in ('PRINT','REPRINT') or (printer_profile_id is not null and document_type in
          ('TICKET','CREDIT_RECEIPT','ROUTE_LOAD','ROUTE_RETURN','CASH_CLOSE','REPORT'))
      );
  `.execute(database);
}

export async function down(): Promise<void> {
  throw new Error('Preserve note numbers and payment history; use a roll-forward migration');
}

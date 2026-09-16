-- Synthetic history, loaded atomically into a newly created test database only.
-- No disabled constraints/triggers and no deletes/updates of immutable history.
create function pg_temp.perf_id(kind text, n integer) returns uuid language sql immutable as $$
  select overlay(overlay(md5('wm-perf-v1:' || kind || ':' || n::text) placing '4' from 13) placing '8' from 17)::uuid
$$;
insert into app_user (id, username, display_name, password_hash, role)
select pg_temp.perf_id('user', n), 'perf-' || n, 'Performance administrator ' || n,
  (select password_hash from app_user where username = 'admin'), 'ADMINISTRATOR'
from generate_series(1,25) n;
insert into unit (id, code, name, quantity_scale) values (pg_temp.perf_id('unit',1), 'PERF-EA', 'Each',0);
insert into category (id, name, reporting_group) values (pg_temp.perf_id('category',1), 'Performance category','OTHER');
insert into product (id, sku, name, category_id, unit_id, standard_unit_price, low_stock_threshold)
select pg_temp.perf_id('product',n), 'PERF-P-' || lpad(n::text,5,'0'),
  'Perf product ' || lpad(n::text,5,'0'), pg_temp.perf_id('category',1), pg_temp.perf_id('unit',1), 10.0000, 1.000
from generate_series(1,10000) n;
insert into customer (id, customer_number, display_name, city)
select pg_temp.perf_id('customer',n), 'PERF-C-' || lpad(n::text,5,'0'),
  'Perf customer ' || lpad(n::text,5,'0'), 'Magdalena' from generate_series(1,10000) n;
insert into vehicle (id, code, name) values (pg_temp.perf_id('vehicle',1),'PERF-V','Performance vehicle');
insert into route (id, route_number, state, origin_location_id, driver_id, vehicle_id, business_date, created_by, started_at)
values (pg_temp.perf_id('route',1),'PERF-R','EN_ROUTE','00000000-0000-4000-8000-000000000020',
 '00000000-0000-4000-8000-000000000011',pg_temp.perf_id('vehicle',1),'2026-01-01',
 '00000000-0000-4000-8000-000000000010','2026-01-01T07:00:00Z');
insert into stock_location (id, kind, route_id) values (pg_temp.perf_id('stock',1),'ROUTE',pg_temp.perf_id('route',1));
insert into inventory_operation (id, operation_type, actor_id, related_entity_type, related_entity_id, occurred_at)
values (pg_temp.perf_id('entry',1),'ENTRY','00000000-0000-4000-8000-000000000010','FIXTURE',pg_temp.perf_id('entry',1),'2026-01-01T06:00:00Z'),
 (pg_temp.perf_id('load',1),'ROUTE_LOAD','00000000-0000-4000-8000-000000000010','ROUTE_LOAD',pg_temp.perf_id('load',1),'2026-01-01T07:00:00Z');
insert into route_load (id, route_id, state, recorded_by, confirmed_at, inventory_operation_id)
values (pg_temp.perf_id('load',1),pg_temp.perf_id('route',1),'CONFIRMED','00000000-0000-4000-8000-000000000010','2026-01-01T07:00:00Z',pg_temp.perf_id('load',1));
insert into route_load_line (route_load_id, product_id, quantity, product_name, unit_code, quantity_scale)
select pg_temp.perf_id('load',1),id,10.000,name,'PERF-EA',0 from product;
insert into inventory_balance (stock_location_id, product_id, quantity, updated_at)
select s.id,p.id, case when s.kind = 'BRANCH' then 100.000 else 0.000 end, '2026-01-03T00:00:00Z'
from product p cross join stock_location s where s.branch_id = '00000000-0000-4000-8000-000000000020' or s.route_id = pg_temp.perf_id('route',1);
insert into inventory_movement (operation_id, product_id, destination_stock_location_id, quantity, destination_balance_after, actor_id, related_entity_type, related_entity_id, occurred_at)
select pg_temp.perf_id('entry',1),p.id,s.id,110.000,110.000,'00000000-0000-4000-8000-000000000010','FIXTURE',pg_temp.perf_id('entry',1),'2026-01-01T06:00:00Z'
from product p cross join stock_location s where s.branch_id = '00000000-0000-4000-8000-000000000020';
insert into inventory_movement (operation_id, product_id, source_stock_location_id, destination_stock_location_id, quantity, source_balance_after, destination_balance_after, actor_id, related_entity_type, related_entity_id, occurred_at)
select pg_temp.perf_id('load',1),p.id,s.id,pg_temp.perf_id('stock',1),10.000,100.000,10.000,'00000000-0000-4000-8000-000000000010','ROUTE_LOAD',pg_temp.perf_id('load',1),'2026-01-01T07:00:00Z'
from product p cross join stock_location s where s.branch_id = '00000000-0000-4000-8000-000000000020';
insert into idempotency_request (id, actor_id, operation_type, idempotency_key, request_hash, state, resource_type, resource_id, http_status, completed_at)
select pg_temp.perf_id('request',n),'00000000-0000-4000-8000-000000000011','SALE_CONFIRMATION','perf-sale-' || n,
 encode(digest('synthetic-perf-sale-' || n,'sha256'),'hex'),'COMPLETED','SALE',pg_temp.perf_id('sale',n),201,'2026-01-01T07:00:00Z'::timestamptz + n * interval '1 second'
from generate_series(1,100000) n;
insert into inventory_operation (id, operation_type, actor_id, related_entity_type, related_entity_id, occurred_at)
select pg_temp.perf_id('operation',n),'SALE','00000000-0000-4000-8000-000000000011','SALE',pg_temp.perf_id('sale',n),
 '2026-01-01T07:00:00Z'::timestamptz + n * interval '1 second' from generate_series(1,100000) n;
insert into sale (id, sale_number, client_operation_id, customer_id, driver_id, route_id, origin_location_id, payment_method, currency_code, subtotal, total, rounding_mode, completed_at, inventory_operation_id, idempotency_request_id)
select pg_temp.perf_id('sale',n),'PERF-S-' || lpad(n::text,6,'0'),pg_temp.perf_id('client',n),pg_temp.perf_id('customer',1+(n-1)%10000),
 '00000000-0000-4000-8000-000000000011',pg_temp.perf_id('route',1),'00000000-0000-4000-8000-000000000020','CASH','MXN',10.00,10.00,'HALF_AWAY_FROM_ZERO',
 '2026-01-01T07:00:00Z'::timestamptz + n * interval '1 second',pg_temp.perf_id('operation',n),pg_temp.perf_id('request',n)
from generate_series(1,100000) n;
insert into sale_line (sale_id, sequence, product_id, product_name, category_name, reporting_group, unit_code, quantity, unit_price, line_amount, applied_price_source)
select pg_temp.perf_id('sale',n),1,p.id,p.name,'Performance category','OTHER','PERF-EA',1.000,10.0000,10.00,'STANDARD'
from generate_series(1,100000) n join product p on p.id = pg_temp.perf_id('product',1+(n-1)%10000);
insert into inventory_movement (operation_id, product_id, source_stock_location_id, quantity, source_balance_after, actor_id, related_entity_type, related_entity_id, occurred_at)
select pg_temp.perf_id('operation',n),pg_temp.perf_id('product',1+(n-1)%10000),pg_temp.perf_id('stock',1),1.000,9-(n-1)/10000,
 '00000000-0000-4000-8000-000000000011','SALE',pg_temp.perf_id('sale',n),'2026-01-01T07:00:00Z'::timestamptz + n * interval '1 second'
from generate_series(1,100000) n;
insert into sale_ticket (sale_id, ticket_number, printable_snapshot, content_version, created_at)
select s.id, 'PERF-T-' || substr(s.sale_number,8), jsonb_build_object(
 'saleNumber',s.sale_number,'ticketNumber','PERF-T-' || substr(s.sale_number,8),'customerId',s.customer_id,'driverId',s.driver_id,
 'routeId',s.route_id,'paymentMethod',s.payment_method,'currencyCode',s.currency_code,'total',s.total::text,
 'lines',jsonb_build_array(jsonb_build_object('productId',l.product_id,'productName',l.product_name,'categoryName',l.category_name,
 'reportingGroup',l.reporting_group,'unitCode',l.unit_code,'quantity',l.quantity::text,'appliedPriceSource',l.applied_price_source,'unitPrice',l.unit_price::text,'lineAmount',l.line_amount::text))),
 '1',s.completed_at from sale s join sale_line l on l.sale_id=s.id;
insert into audit_event (actor_id, occurred_at, action, entity_type, entity_id, after_values, operation_id, request_id)
select s.driver_id,s.completed_at,'SALE_CONFIRMED','SALE',s.id,jsonb_build_object('saleNumber',s.sale_number,'total',s.total::text,'routeId',s.route_id),s.inventory_operation_id,'perf-' || s.id
from sale s;
update idempotency_request i set response_snapshot = t.printable_snapshot || jsonb_build_object('id',s.id,'status',s.status,'completedAt',s.completed_at)
from sale s join sale_ticket t on t.sale_id=s.id where i.id=s.idempotency_request_id;

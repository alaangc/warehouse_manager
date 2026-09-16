import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import express from 'express';
import { sql } from 'kysely';
import { startPostgres } from '../../../apps/api/tests/support/postgres-container.js';
import { createDatabase } from '../../../apps/api/src/db/database.js';
import { migrateToLatest } from '../../../apps/api/src/db/migrate.js';
import { createServer } from '../../../apps/api/src/server.js';
import { seedFoundation } from '../../../database/seeds/001_foundation.js';

export const performanceSeed = 'warehouse-t138-v1';
export const performancePassword = 'development-password-change-me';

// Every invocation owns a fresh database, in a container by default or on the
// explicitly configured local PostgreSQL 18 test server. DATABASE_URL is ignored.
export async function startPerformanceFixture(options: { salesIntervalSeconds?: number } = {}) {
  const salesIntervalSeconds = options.salesIntervalSeconds ?? 1;
  assert(Number.isSafeInteger(salesIntervalSeconds) && salesIntervalSeconds > 0);
  const { container, connectionString } = await startPostgres();
  const database = createDatabase(connectionString);
  const storage = await mkdtemp(join(tmpdir(), 'warehouse-performance-'));
  let server: Server | undefined;
  async function close() {
    server?.closeAllConnections();
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await database.destroy();
    await container.stop();
    await rm(storage, { recursive: true, force: true });
  }
  try {
    await migrateToLatest(database);
    await seedFoundation(database);
    // Deterministic bulk fixtures retain constraints, immutable triggers, tickets,
    // sale lines, audit records and balanced inventory movements. No triggers are disabled.
    await database.transaction().execute(async (transaction) => {
      await sql
        .raw(
          `
        create function pg_temp.perf_id(kind int, n int) returns uuid language sql immutable as
        $$ select ('00000000-0000-4000-8000-' || lpad(kind::text,2,'0') || lpad(n::text,10,'0'))::uuid $$;
        insert into app_user (id, username, display_name, password_hash, role)
        select pg_temp.perf_id(1,n), 'perf-' || n, 'Performance ' || n, password_hash, 'ADMINISTRATOR'
        from generate_series(0,24) n cross join app_user where username='admin';
        insert into unit (id,code,name,quantity_scale) values (pg_temp.perf_id(2,1),'PCS','Piece',3);
        insert into category (id,name,reporting_group) values (pg_temp.perf_id(3,1),'Performance goods','OTHER');
        insert into product (id,sku,name,category_id,unit_id,standard_unit_price,low_stock_threshold,created_at)
        select pg_temp.perf_id(4,n), 'SKU-' || lpad(n::text,5,'0'), 'Product ' || lpad(n::text,5,'0'),
          pg_temp.perf_id(3,1), pg_temp.perf_id(2,1), 10, 5, '2030-01-01'::timestamptz + n * interval '1 second'
        from generate_series(1,10000) n;
        insert into customer (id,customer_number,display_name,city,created_at)
        select pg_temp.perf_id(5,n), 'CUS-' || lpad(n::text,5,'0'), 'Customer ' || lpad(n::text,5,'0'),
          'Magdalena', '2030-01-01'::timestamptz + n * interval '1 second' from generate_series(1,10000) n;
        insert into vehicle(id,code,name) values(pg_temp.perf_id(6,1),'PERF','Performance vehicle');
        insert into route(id,route_number,state,origin_location_id,driver_id,vehicle_id,business_date,created_by,started_at)
        values(pg_temp.perf_id(7,1),'PERF-ROUTE','EN_ROUTE','00000000-0000-4000-8000-000000000020',
          '00000000-0000-4000-8000-000000000011',pg_temp.perf_id(6,1),'2030-01-01',
          '00000000-0000-4000-8000-000000000010','2030-01-01T00:00:00Z');
        insert into stock_location(id,kind,route_id) values(pg_temp.perf_id(8,1),'ROUTE',pg_temp.perf_id(7,1));
        insert into inventory_operation(id,operation_type,actor_id,related_entity_type,related_entity_id,occurred_at)
        values(pg_temp.perf_id(9,1),'ENTRY','00000000-0000-4000-8000-000000000010','FIXTURE',pg_temp.perf_id(9,1),'2029-12-30'),
          (pg_temp.perf_id(9,2),'ROUTE_LOAD','00000000-0000-4000-8000-000000000010','ROUTE_LOAD',pg_temp.perf_id(10,1),'2029-12-31');
        insert into route_load(id,route_id,state,recorded_by,confirmed_at,inventory_operation_id)
        values(pg_temp.perf_id(10,1),pg_temp.perf_id(7,1),'CONFIRMED','00000000-0000-4000-8000-000000000010',
          '2029-12-31',pg_temp.perf_id(9,2));
        insert into route_load_line(route_load_id,product_id,quantity,product_name,unit_code,quantity_scale)
        select pg_temp.perf_id(10,1),id,50,name,'PCS',3 from product;
        insert into inventory_movement(operation_id,product_id,destination_stock_location_id,quantity,destination_balance_after,
          actor_id,related_entity_type,related_entity_id,occurred_at)
        select pg_temp.perf_id(9,1),p.id,s.id,100,100,'00000000-0000-4000-8000-000000000010','FIXTURE',pg_temp.perf_id(9,1),'2029-12-30'
        from product p cross join stock_location s where s.branch_id='00000000-0000-4000-8000-000000000020';
        insert into inventory_movement(operation_id,product_id,source_stock_location_id,destination_stock_location_id,
          quantity,source_balance_after,destination_balance_after,actor_id,related_entity_type,related_entity_id,occurred_at)
        select pg_temp.perf_id(9,2),p.id,s.id,pg_temp.perf_id(8,1),50,50,50,
          '00000000-0000-4000-8000-000000000010','ROUTE_LOAD',pg_temp.perf_id(10,1),'2029-12-31'
        from product p cross join stock_location s where s.branch_id='00000000-0000-4000-8000-000000000020';
        insert into idempotency_request(id,actor_id,operation_type,idempotency_key,request_hash,state,resource_type,resource_id,http_status,completed_at)
        select pg_temp.perf_id(11,n),'00000000-0000-4000-8000-000000000011','SALE_CONFIRM',
          'warehouse-t138-v1-' || n, encode(digest('warehouse-t138-v1-' || n,'sha256'),'hex'),'COMPLETED','SALE',pg_temp.perf_id(12,n),201,
          '2030-01-01'::timestamptz + n * interval '${salesIntervalSeconds} seconds' from generate_series(1,100000) n;
        insert into inventory_operation(id,operation_type,actor_id,related_entity_type,related_entity_id,occurred_at)
        select pg_temp.perf_id(13,n),'SALE','00000000-0000-4000-8000-000000000011','SALE',pg_temp.perf_id(12,n),
          '2030-01-01'::timestamptz + n * interval '${salesIntervalSeconds} seconds' from generate_series(1,100000) n;
        insert into sale(id,sale_number,client_operation_id,customer_id,driver_id,route_id,origin_location_id,payment_method,
          currency_code,subtotal,total,rounding_mode,completed_at,inventory_operation_id,idempotency_request_id)
        select pg_temp.perf_id(12,n),'PERF-S-' || n,pg_temp.perf_id(14,n),pg_temp.perf_id(5,1+(n-1)%10000),
          '00000000-0000-4000-8000-000000000011',pg_temp.perf_id(7,1),'00000000-0000-4000-8000-000000000020',
          'CASH','MXN',10,10,'HALF_AWAY_FROM_ZERO','2030-01-01'::timestamptz + n * interval '${salesIntervalSeconds} seconds',
          pg_temp.perf_id(13,n),pg_temp.perf_id(11,n) from generate_series(1,100000) n;
        insert into sale_line(sale_id,sequence,product_id,product_name,category_name,reporting_group,unit_code,quantity,unit_price,line_amount,applied_price_source)
        select pg_temp.perf_id(12,n),1,p.id,p.name,'Performance goods','OTHER','PCS',1,10,10,'STANDARD'
        from generate_series(1,100000) n join product p on p.id=pg_temp.perf_id(4,1+(n-1)%10000);
        insert into inventory_movement(operation_id,product_id,source_stock_location_id,quantity,source_balance_after,
          actor_id,related_entity_type,related_entity_id,occurred_at)
        select pg_temp.perf_id(13,n),pg_temp.perf_id(4,1+(n-1)%10000),pg_temp.perf_id(8,1),1,49-(n-1)/10000,
          '00000000-0000-4000-8000-000000000011','SALE',pg_temp.perf_id(12,n),
          '2030-01-01'::timestamptz + n * interval '${salesIntervalSeconds} seconds' from generate_series(1,100000) n;
        insert into inventory_balance(stock_location_id,product_id,quantity,updated_at)
        select s.id,p.id,50,'2030-01-03' from product p cross join stock_location s
          where s.branch_id='00000000-0000-4000-8000-000000000020';
        insert into inventory_balance(stock_location_id,product_id,quantity,updated_at)
        select pg_temp.perf_id(8,1),id,40,'2030-01-03' from product;
        insert into sale_ticket(sale_id,ticket_number,content_version,printable_snapshot)
        select s.id,'PERF-T-' || substring(s.sale_number from 8),'1',jsonb_build_object(
          'saleNumber',s.sale_number,'ticketNumber','PERF-T-' || substring(s.sale_number from 8),
          'customerId',s.customer_id,'driverId',s.driver_id,'routeId',s.route_id,'paymentMethod',s.payment_method,
          'currencyCode','MXN','total','10.00','lines',jsonb_build_array(jsonb_build_object(
            'productId',l.product_id,'productName',l.product_name,'categoryName',l.category_name,'reportingGroup','OTHER',
            'unitCode','PCS','quantity','1.000','appliedPriceSource','STANDARD','unitPrice','10.0000','lineAmount','10.00')))
        from sale s join sale_line l on l.sale_id=s.id;
        update idempotency_request i set response_snapshot=jsonb_build_object('id',s.id,'saleNumber',s.sale_number,'status',s.status,
          'customerId',s.customer_id,'driverId',s.driver_id,'routeId',s.route_id,'total','10.00') from sale s where s.idempotency_request_id=i.id;
        insert into audit_event(actor_id,action,entity_type,entity_id,operation_id,request_id,after_values,occurred_at)
        select driver_id,'SALE_CONFIRMED','SALE',id,inventory_operation_id,sale_number,
          jsonb_build_object('saleNumber',sale_number,'total','10.00','routeId',route_id),completed_at from sale;
      `,
        )
        .execute(transaction);
    });
    await sql`analyze`.execute(database);
    const counts = (
      await sql<{
        products: number;
        customers: number;
        sales: number;
        lines: number;
        tickets: number;
      }>`select (select count(*)::int from product) products, (select count(*)::int from customer) customers,
        (select count(*)::int from sale where status='COMPLETED') sales,
        (select count(*)::int from sale_line) lines, (select count(*)::int from sale_ticket) tickets`.execute(
        database,
      )
    ).rows[0]!;
    assert.deepEqual(counts, {
      products: 10000,
      customers: 10000,
      sales: 100000,
      lines: 100000,
      tickets: 100000,
    });
    const postgresVersion = (await sql<{ version: string }>`select version()`.execute(database))
      .rows[0]!.version;
    const outer = express();
    server = await new Promise<Server>((resolve) => {
      const listening = outer.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    assert(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const api = createServer(
      {
        NODE_ENV: 'test',
        DATABASE_URL: connectionString,
        SESSION_SECRET: randomUUID(),
        TRUST_PROXY: '127.0.0.1/32,::1/128',
        APP_ORIGIN: origin,
        BUSINESS_TIMEZONE: 'America/Hermosillo',
        BUSINESS_CURRENCY: 'MXN',
        PORT: address.port,
        LOG_LEVEL: 'fatal',
        DOCUMENT_STORAGE_PATH: storage,
      },
      { database },
    );
    outer.use((req, res, next) => (req.path.startsWith('/api/') ? api(req, res, next) : next()));
    const dist = fileURLToPath(new URL('../../../apps/web/dist/', import.meta.url));
    outer.use(express.static(dist));
    outer.get(/.*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
    return { origin, counts, postgresVersion, database, close };
  } catch (error) {
    await close();
    throw error;
  }
}

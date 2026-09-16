import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, platform, release, arch } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { sql } from 'kysely';
import { createDatabase } from '../../src/db/database.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import { seedFoundation } from '../../../../database/seeds/001_foundation.js';
import { startPostgres } from './postgres-container.js';
import { createServer } from '../../src/server.js';
import { PERFORMANCE_SEED } from '../../../../tests/e2e/support/performance-profile.js';

export async function createPerformanceFixture() {
  if (process.env.TEST_POSTGRES_ADMIN_URL)
    throw new Error(
      'Performance acceptance requires its own Docker container; unset TEST_POSTGRES_ADMIN_URL.',
    );
  const postgres = await startPostgres();
  const database = createDatabase(postgres.connectionString);
  const storage = await mkdtemp(join(tmpdir(), 'warehouse-performance-'));
  const server = createHttpServer();
  const close = async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      await database.destroy();
    } finally {
      try {
        await postgres.container.stop();
      } finally {
        await rm(storage, { recursive: true, force: true });
      }
    }
  };
  try {
    const build = fileURLToPath(new URL('../../../web/dist/', import.meta.url));
    await readFile(join(build, 'index.html')); // Fail clearly if production assets were not built.
    await migrateToLatest(database);
    await seedFoundation(database);
    const seed = await readFile(
      new URL('../../../../tests/e2e/support/performance-seed.sql', import.meta.url),
      'utf8',
    );
    await database.transaction().execute(async (transaction) => {
      await sql.raw(seed).execute(transaction);
    });
    await sql`analyze`.execute(database);
    const counts = (
      await sql<{
        products: number;
        customers: number;
        sales: number;
        tickets: number;
        lines: number;
        audits: number;
      }>`
      select (select count(*)::int from product) products,(select count(*)::int from customer) customers,
        (select count(*)::int from sale where status='COMPLETED') sales,(select count(*)::int from sale_ticket) tickets,
        (select count(*)::int from sale_line) lines,(select count(*)::int from audit_event where action='SALE_CONFIRMED') audits
    `.execute(database)
    ).rows[0]!;
    if (
      JSON.stringify(counts) !==
      JSON.stringify({
        products: 10000,
        customers: 10000,
        sales: 100000,
        tickets: 100000,
        lines: 100000,
        audits: 100000,
      })
    )
      throw new Error(`Unexpected acceptance fixture cardinalities: ${JSON.stringify(counts)}`);
    const integrity = (
      await sql<{ bad: number }>`
      with deltas as (
        select product_id,destination_stock_location_id stock,sum(quantity) delta from inventory_movement where destination_stock_location_id is not null group by 1,2
        union all select product_id,source_stock_location_id,-sum(quantity) from inventory_movement where source_stock_location_id is not null group by 1,2
      ), totals as (select product_id,stock,sum(delta) quantity from deltas group by 1,2)
      select count(*)::int bad from inventory_balance b full join totals t on t.product_id=b.product_id and t.stock=b.stock_location_id
      where b.quantity is distinct from t.quantity
    `.execute(database)
    ).rows[0]!;
    if (integrity.bad) throw new Error('Performance fixture ledger does not reconcile');
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing performance server port');
    const origin = `http://127.0.0.1:${address.port}`;
    const api = createServer(
      {
        NODE_ENV: 'development',
        DATABASE_URL: postgres.connectionString,
        SESSION_SECRET: randomBytes(32).toString('hex'),
        APP_ORIGIN: origin,
        BUSINESS_TIMEZONE: 'America/Hermosillo',
        BUSINESS_CURRENCY: 'MXN',
        PORT: address.port,
        LOG_LEVEL: 'fatal',
        DOCUMENT_STORAGE_PATH: storage,
        TRUST_PROXY: '127.0.0.1/32',
      },
      { database },
    );
    const web = express();
    web.use(express.static(build));
    web.get('/{*path}', (_request, response) => {
      response.sendFile(join(build, 'index.html'));
    });
    server.on('request', (request, response) => {
      // Test-only loopback ingress models 25 distinct proxy client IPs. Preserve
      // production API/login limits; never accept a caller-supplied forwarding chain.
      const client = Number(request.headers['x-performance-client']);
      request.headers['x-forwarded-for'] =
        Number.isInteger(client) && client >= 1 && client <= 25
          ? `192.0.2.${client}`
          : '192.0.2.254';
      delete request.headers['x-performance-client'];
      if (request.url?.startsWith('/api/')) api(request, response);
      else web(request, response);
    });
    const version = (await sql<{ version: string }>`select version()`.execute(database)).rows[0]!
      .version;
    return {
      database,
      origin,
      close,
      metadata: {
        seed: PERFORMANCE_SEED,
        counts,
        ledgerMismatches: integrity.bad,
        postgres: version,
        node: process.version,
        platform: platform(),
        osRelease: release(),
        architecture: arch(),
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
        memoryBytes: totalmem(),
        topology:
          'Same-host production Vite assets + Express + disposable PostgreSQL; 25 test-only proxy client IPs; normal rate limits; no network shaping',
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

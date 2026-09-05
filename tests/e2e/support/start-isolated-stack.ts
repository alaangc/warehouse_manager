import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { startPostgres } from '../../../apps/api/tests/support/postgres-container.js';
import { createDatabase } from '../../../apps/api/src/db/database.js';
import { migrateToLatest } from '../../../apps/api/src/db/migrate.js';
import { seedFoundation } from '../../../database/seeds/001_foundation.js';
import { createServer } from '../../../apps/api/src/server.js';
import {
  createSaleScenario,
  saleCommand,
} from '../../../apps/api/tests/support/sales-factories.js';
import { SaleService } from '../../../apps/api/src/modules/sales/sale-service.js';
import { CancellationService } from '../../../apps/api/src/modules/sales/cancellation-service.js';
import { resolveReportingPeriod } from '../../../apps/api/src/modules/reports/reporting-period.js';

// This launcher only writes to the container it creates; it never reads DATABASE_URL.
const postgres = await startPostgres();
const database = createDatabase(postgres.connectionString);
let api: Server | undefined;
let web: ReturnType<typeof spawn> | undefined;
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  web?.kill('SIGTERM');
  api?.closeAllConnections();
  if (api) await new Promise<void>((resolve) => api!.close(() => resolve()));
  await database.destroy();
  await postgres.container.stop();
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
try {
  await migrateToLatest(database);
  await seedFoundation(database);
  for (const [index, browser] of ['chromium', 'firefox', 'webkit'].entries()) {
    const anchorDate = `${2031 + index}-09-17`;
    const periods = (['DAY', 'WEEK', 'MONTH'] as const).map((periodKind) =>
      resolveReportingPeriod({ periodKind, anchorDate, businessTimezone: 'America/Hermosillo' }),
    );
    const scenario = await createSaleScenario(database, {
      stockQuantity: '30.000',
      standardUnitPrice: '10.0050',
    });
    await database
      .updateTable('product')
      .set({ name: `Reporting fixture ${browser}` })
      .where('id', '=', scenario.product.id)
      .execute();
    const instants = [
      ...new Set(periods.flatMap((period) => [period.periodStart, period.periodEnd])),
    ];
    instants.push(`${2031 + index}-08-31T06:59:59Z`);
    for (const instant of instants) {
      const sale = await new SaleService(database).confirm(
        saleCommand({
          customerId: scenario.customer.id,
          routeId: scenario.route.id,
          productId: scenario.product.id,
        }),
        { actorId: scenario.driver.id, idempotencyKey: randomUUID(), requestId: randomUUID() },
      );
      await database
        .updateTable('sale')
        .set({ completed_at: instant })
        .where('id', '=', sale.id)
        .execute();
    }
    const cancelled = await new SaleService(database).confirm(
      saleCommand({
        customerId: scenario.customer.id,
        routeId: scenario.route.id,
        productId: scenario.product.id,
      }),
      { actorId: scenario.driver.id, idempotencyKey: randomUUID(), requestId: randomUUID() },
    );
    await database
      .updateTable('sale')
      .set({ completed_at: `${anchorDate}T15:00:00Z` })
      .where('id', '=', cancelled.id)
      .execute();
    await new CancellationService(database).cancel(cancelled.id, 'Excluded reporting fixture', {
      actorId: scenario.admin.id,
      idempotencyKey: randomUUID(),
      requestId: randomUUID(),
    });
  }
  const app = createServer(
    {
      NODE_ENV: 'development',
      DATABASE_URL: postgres.connectionString,
      SESSION_SECRET: randomUUID(),
      APP_ORIGIN: 'http://127.0.0.1:5173',
      BUSINESS_TIMEZONE: 'America/Hermosillo',
      BUSINESS_CURRENCY: 'MXN',
      PORT: 3000,
      LOG_LEVEL: 'fatal',
      DOCUMENT_STORAGE_PATH: '/tmp/warehouse-report-e2e-documents',
    },
    { database },
  );
  await new Promise<void>((resolve, reject) => {
    api = app.listen(3000, '127.0.0.1', resolve);
    api.once('error', reject);
  });
  web = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../../../apps/web/node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
      '--strictPort',
    ],
    { cwd: fileURLToPath(new URL('../../../apps/web', import.meta.url)), stdio: 'inherit' },
  );
  web.once('exit', () => {
    void stop();
  });
  web.once('error', (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    void stop();
  });
} catch (error) {
  await stop();
  throw error;
}

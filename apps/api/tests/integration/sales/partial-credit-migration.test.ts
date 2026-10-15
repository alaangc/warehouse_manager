import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase } from '../../../src/db/database.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { CreditService } from '../../../src/modules/sales/credit-service.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { startPostgres } from '../../support/postgres-container.js';

it('preserves existing settlements and receipts while enabling repeated payments after migration', async () => {
  const postgres = await startPostgres();
  const db = createDatabase(postgres.connectionString);
  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: fileURLToPath(
          new URL('../../../../../database/migrations/', import.meta.url),
        ),
        import: (file) => import(pathToFileURL(file).href),
      }),
    });
    expect((await migrator.migrateTo('011_customer_credit_usd_notes')).error).toBeUndefined();
    await seedFoundation(db);
    const f = await createSaleScenario(db, { stockQuantity: '20' });
    const ctx = () => ({
      actorId: f.admin.id,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    });
    const sale = await new SaleService(db).confirm(
      {
        ...saleCommand({ customerId: f.customer.id, routeId: f.route.id, productId: f.product.id }),
        paymentMethod: 'CREDIT',
      },
      { ...ctx(), actorId: f.driver.id },
    );
    const credit = new CreditService(db);
    await credit.pay(f.customer.id, { saleIds: [sale.id], paymentMethod: 'CASH' }, ctx());
    const payments = await db.selectFrom('credit_payment').selectAll().execute();
    const allocations = await db.selectFrom('credit_payment_sale').selectAll().execute();
    expect((await migrator.migrateToLatest()).error).toBeUndefined();
    expect(await db.selectFrom('credit_payment').selectAll().execute()).toEqual(payments);
    expect(await db.selectFrom('credit_payment_sale').selectAll().execute()).toEqual(allocations);
    expect(await credit.list(f.customer.id)).toMatchObject({ total: '0.00', noteCount: 0 });
    const next = await new SaleService(db).confirm(
      {
        ...saleCommand({ customerId: f.customer.id, routeId: f.route.id, productId: f.product.id }),
        paymentMethod: 'CREDIT',
      },
      { ...ctx(), actorId: f.driver.id },
    );
    await credit.pay(
      f.customer.id,
      { saleIds: [next.id], paymentMethod: 'CASH', amount: '1.00' },
      ctx(),
    );
    await credit.pay(f.customer.id, { saleIds: [next.id], paymentMethod: 'CASH' }, ctx());
    expect(await credit.list(f.customer.id)).toMatchObject({ total: '0.00', noteCount: 0 });
  } finally {
    await db.destroy();
    await postgres.container.stop();
  }
});

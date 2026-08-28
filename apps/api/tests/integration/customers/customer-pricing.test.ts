import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { CustomerPriceRepository } from '../../../src/modules/customers/customer-price-repository.js';
import { CustomerPriceService } from '../../../src/modules/customers/customer-price-service.js';
import { CustomerService } from '../../../src/modules/customers/customer-service.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('customer and special-price lifecycle', () => {
  let container: TestDatabase;
  let database: AppDatabase;

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
  }, 120_000);

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  it('creates, deactivates, falls back, archives, and audits without rewriting prices', async () => {
    const admin = await database
      .selectFrom('app_user')
      .select('id')
      .where('username', '=', 'admin')
      .executeTakeFirstOrThrow();
    const category = await database
      .insertInto('category')
      .values({
        name: `Customer ${crypto.randomUUID()}`,
        reporting_group: 'OTHER',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const unit = await database
      .insertInto('unit')
      .values({
        code: `C-${crypto.randomUUID()}`,
        name: 'Customer test unit',
        quantity_scale: 0,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const product = await database
      .insertInto('product')
      .values({
        sku: `C-${crypto.randomUUID()}`,
        name: 'Customer price product',
        description: null,
        category_id: category.id,
        unit_id: unit.id,
        standard_unit_price: '20.0000',
        low_stock_threshold: '0.000',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const customers = new CustomerService(database);
    const customer = await customers.create(
      { displayName: 'Pricing customer', city: 'Magdalena' },
      admin.id,
      crypto.randomUUID(),
    );
    const prices = new CustomerPriceService(database);
    const validFrom = new Date(Date.now() - 60_000).toISOString();
    const price = await prices.create(
      customer.id,
      { productId: product.id, unitPrice: '17.2500', validFrom },
      admin.id,
      crypto.randomUUID(),
    );
    const effective = await database
      .transaction()
      .execute((transaction) =>
        new CustomerPriceRepository(transaction).findEffective(customer.id, product.id, new Date()),
      );
    expect(effective?.unit_price).toBe('17.2500');
    await expect(
      prices.create(
        customer.id,
        { productId: product.id, unitPrice: '16.0000', validFrom },
        admin.id,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: '23P01' });
    await prices.deactivate(price.id, 'Return to standard pricing', admin.id, crypto.randomUUID());
    const fallback = await database
      .transaction()
      .execute((transaction) =>
        new CustomerPriceRepository(transaction).findEffective(customer.id, product.id, new Date()),
      );
    expect(fallback).toBeUndefined();
    const archived = await customers.update(
      customer.id,
      {
        expectedVersion: customer.version,
        displayName: customer.display_name,
        city: customer.city,
        active: false,
        reason: 'No longer trading',
      },
      admin.id,
      crypto.randomUUID(),
    );
    expect(archived.active).toBe(false);
    await expect(
      customers.update(
        customer.id,
        {
          expectedVersion: customer.version,
          displayName: customer.display_name,
          city: customer.city,
          active: true,
        },
        admin.id,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'OPTIMISTIC_CONFLICT' });
    const audits = await database
      .selectFrom('audit_event')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('entity_id', 'in', [customer.id, price.id])
      .executeTakeFirstOrThrow();
    expect(Number(audits.count)).toBe(4);
  });
});

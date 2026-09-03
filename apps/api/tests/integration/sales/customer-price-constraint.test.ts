import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { createSaleScenario } from '../../support/sales-factories.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('customer price exclusion constraint in PostgreSQL 18', () => {
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

  function insertPrice(
    scenario: Awaited<ReturnType<typeof createSaleScenario>>,
    validFrom: Date,
    validTo: Date | null,
    active = true,
  ) {
    return database
      .insertInto('customer_price')
      .values({
        customer_id: scenario.customer.id,
        product_id: scenario.product.id,
        unit_price: '3.7500',
        valid_from: validFrom,
        valid_to: validTo,
        active,
        created_by: scenario.admin.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }

  it('rejects overlap with SQLSTATE 23P01 while accepting adjacent and inactive ranges', async () => {
    const scenario = await createSaleScenario(database);
    const january = new Date('2026-01-01T00:00:00.000Z');
    const february = new Date('2026-02-01T00:00:00.000Z');
    const march = new Date('2026-03-01T00:00:00.000Z');

    await insertPrice(scenario, january, february);
    await expect(
      insertPrice(scenario, new Date('2026-01-15T00:00:00.000Z'), march),
    ).rejects.toMatchObject({ code: '23P01' });
    await expect(insertPrice(scenario, february, march)).resolves.toBeDefined();
    await expect(
      insertPrice(scenario, new Date('2026-01-10T00:00:00.000Z'), february, false),
    ).resolves.toBeDefined();
  });

  it('protects unbounded ranges and concurrent direct SQL writers', async () => {
    const unbounded = await createSaleScenario(database);
    await insertPrice(unbounded, new Date('2026-04-01T00:00:00.000Z'), null);
    await expect(
      insertPrice(unbounded, new Date('2027-01-01T00:00:00.000Z'), null),
    ).rejects.toMatchObject({ code: '23P01' });

    const concurrent = await createSaleScenario(database);
    const writes = await Promise.allSettled([
      insertPrice(concurrent, new Date('2026-06-01T00:00:00.000Z'), null),
      insertPrice(concurrent, new Date('2026-06-01T00:00:00.000Z'), null),
    ]);
    expect(writes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = writes.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toMatchObject({ code: '23P01' });
  });
});

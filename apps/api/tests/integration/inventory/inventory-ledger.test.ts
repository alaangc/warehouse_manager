import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { CatalogService } from '../../../src/modules/catalog/catalog-service.js';
import { InventoryService } from '../../../src/modules/inventory/inventory-service.js';
import { parseExactDecimal } from '../../../src/shared/money.js';
import { createCatalogFixture } from '../../support/catalog-factories.js';
import { expectLedgerMatchesBalance } from '../../support/inventory-assertions.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('inventory ledger lifecycle in PostgreSQL 18', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let actorId: string;
  let branchId: string;
  let stockLocationId: string;

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
    const actor = await database
      .selectFrom('app_user')
      .select('id')
      .where('username', '=', 'admin')
      .executeTakeFirstOrThrow();
    actorId = actor.id;
    const branch = await database
      .selectFrom('location')
      .innerJoin('stock_location', 'stock_location.branch_id', 'location.id')
      .select(['location.id as branchId', 'stock_location.id as stockLocationId'])
      .where('location.code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    branchId = branch.branchId;
    stockLocationId = branch.stockLocationId;
  }, 120_000);

  afterEach(async () => {
    await sql`drop trigger if exists test_reject_audit on audit_event`.execute(database);
    await sql`drop function if exists test_reject_audit_write()`.execute(database);
  });

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  function context() {
    return {
      actorId,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    };
  }

  it('keeps movements, balances, low-stock state, reversal links, and audits consistent', async () => {
    const { product } = await createCatalogFixture(database);
    const inventory = new InventoryService(database);
    const entry = await inventory.createBranchOperation(
      {
        operationType: 'ENTRY',
        branchId,
        reason: 'Initial receiving',
        lines: [{ productId: product.id, quantity: '5' }],
      },
      context(),
    );
    const exit = await inventory.createBranchOperation(
      {
        operationType: 'MANUAL_EXIT',
        branchId,
        reason: 'Damaged stock',
        lines: [{ productId: product.id, quantity: '4' }],
      },
      context(),
    );

    const lowBalance = await database
      .selectFrom('inventory_balance')
      .innerJoin('product', 'product.id', 'inventory_balance.product_id')
      .select(['inventory_balance.quantity', 'product.low_stock_threshold as threshold'])
      .where('inventory_balance.stock_location_id', '=', stockLocationId)
      .where('inventory_balance.product_id', '=', product.id)
      .executeTakeFirstOrThrow();
    expect(lowBalance.quantity).toBe('1.000');
    expect(parseExactDecimal(lowBalance.quantity).lessThanOrEqualTo(lowBalance.threshold)).toBe(
      true,
    );
    await expectLedgerMatchesBalance(database, stockLocationId, product.id);

    const reversal = await inventory.reverse(exit.id, 'Stock recovered', context());
    const reversedOperation = await database
      .selectFrom('inventory_operation')
      .selectAll()
      .where('id', '=', reversal.id)
      .executeTakeFirstOrThrow();
    const originalMovement = await database
      .selectFrom('inventory_movement')
      .selectAll()
      .where('operation_id', '=', exit.id)
      .executeTakeFirstOrThrow();
    const reversalMovement = await database
      .selectFrom('inventory_movement')
      .selectAll()
      .where('operation_id', '=', reversal.id)
      .executeTakeFirstOrThrow();
    expect(reversedOperation.reverses_operation_id).toBe(exit.id);
    expect(reversalMovement.reverses_movement_id).toBe(originalMovement.id);
    expect(reversalMovement.source_stock_location_id).toBeNull();
    expect(reversalMovement.destination_stock_location_id).toBe(stockLocationId);
    await expectLedgerMatchesBalance(database, stockLocationId, product.id);

    const audits = await database
      .selectFrom('audit_event')
      .select(['entity_id', 'operation_id'])
      .where('entity_type', '=', 'INVENTORY_OPERATION')
      .where('entity_id', 'in', [entry.id, exit.id, reversal.id])
      .execute();
    expect(audits).toHaveLength(3);
    expect(audits.every((audit) => audit.entity_id === audit.operation_id)).toBe(true);

    await database
      .updateTable('product')
      .set({ active: false, archived_at: new Date() })
      .where('id', '=', product.id)
      .executeTakeFirstOrThrow();
    expect(
      await database
        .selectFrom('inventory_movement')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('product_id', '=', product.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '3' });
    await expect(
      database.deleteFrom('product').where('id', '=', product.id).execute(),
    ).rejects.toMatchObject({ code: '23001' });
  });

  it('rejects a required blank reason without leaving an operation, movement, or idempotency row', async () => {
    const { product } = await createCatalogFixture(database);
    const inventory = new InventoryService(database);
    await inventory.createBranchOperation(
      {
        operationType: 'ENTRY',
        branchId,
        reason: 'Fixture stock',
        lines: [{ productId: product.id, quantity: '3' }],
      },
      context(),
    );
    const rejectedContext = context();
    const before = await database
      .selectFrom('inventory_operation')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    await expect(
      inventory.createBranchOperation(
        {
          operationType: 'MANUAL_EXIT',
          branchId,
          reason: '   ',
          lines: [{ productId: product.id, quantity: '1' }],
        },
        rejectedContext,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const after = await database
      .selectFrom('inventory_operation')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    expect(after.count).toBe(before.count);
    expect(
      await database
        .selectFrom('inventory_balance')
        .select('quantity')
        .where('stock_location_id', '=', stockLocationId)
        .where('product_id', '=', product.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ quantity: '3.000' });
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('rolls back all earlier line changes when a later line has insufficient stock', async () => {
    const first = await createCatalogFixture(database);
    const second = await createCatalogFixture(database);
    const inventory = new InventoryService(database);
    await inventory.createBranchOperation(
      {
        operationType: 'ENTRY',
        branchId,
        reason: 'Atomicity fixture',
        lines: [{ productId: first.product.id, quantity: '1' }],
      },
      context(),
    );
    const rejectedContext = context();
    await expect(
      inventory.createBranchOperation(
        {
          operationType: 'MANUAL_EXIT',
          branchId,
          reason: 'Atomic multi-line exit',
          lines: [
            { productId: first.product.id, quantity: '1' },
            { productId: second.product.id, quantity: '1' },
          ],
        },
        rejectedContext,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_INVENTORY' });
    const balances = await database
      .selectFrom('inventory_balance')
      .select(['product_id', 'quantity'])
      .where('stock_location_id', '=', stockLocationId)
      .where('product_id', 'in', [first.product.id, second.product.id])
      .execute();
    expect(new Map(balances.map((balance) => [balance.product_id, balance.quantity]))).toEqual(
      new Map([[first.product.id, '1.000']]),
    );
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('rolls back catalog and inventory mutations when their same-transaction audit write fails', async () => {
    const fixture = await createCatalogFixture(database);
    const catalog = new CatalogService(database);
    const successfulProduct = await catalog.createProduct(
      {
        sku: `AUDIT-${crypto.randomUUID()}`,
        name: 'Successfully audited product',
        categoryId: fixture.category.id,
        unitId: fixture.unit.id,
        standardUnitPrice: '12.0000',
        lowStockThreshold: '1.000',
      },
      actorId,
      crypto.randomUUID(),
    );
    expect(
      await database
        .selectFrom('audit_event')
        .select('id')
        .where('entity_type', '=', 'PRODUCT')
        .where('entity_id', '=', successfulProduct.id)
        .executeTakeFirst(),
    ).toBeDefined();

    await sql`
      create function test_reject_audit_write() returns trigger language plpgsql as $$
      begin raise exception 'injected audit failure'; end $$;
      create trigger test_reject_audit before insert on audit_event
      for each row execute function test_reject_audit_write()
    `.execute(database);

    const failedSku = `FAILED-${crypto.randomUUID()}`;
    await expect(
      catalog.createProduct(
        {
          sku: failedSku,
          name: 'Must roll back',
          categoryId: fixture.category.id,
          unitId: fixture.unit.id,
          standardUnitPrice: '8.0000',
          lowStockThreshold: '1.000',
        },
        actorId,
        crypto.randomUUID(),
      ),
    ).rejects.toThrow('injected audit failure');
    expect(
      await database
        .selectFrom('product')
        .select('id')
        .where('sku', '=', failedSku)
        .executeTakeFirst(),
    ).toBeUndefined();

    const rejectedContext = context();
    await expect(
      new InventoryService(database).createBranchOperation(
        {
          operationType: 'ENTRY',
          branchId,
          reason: 'Must roll back with audit',
          lines: [{ productId: successfulProduct.id, quantity: '2' }],
        },
        rejectedContext,
      ),
    ).rejects.toThrow('injected audit failure');
    expect(
      await database
        .selectFrom('inventory_balance')
        .select('id')
        .where('stock_location_id', '=', stockLocationId)
        .where('product_id', '=', successfulProduct.id)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });
});

import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { InventoryService } from '../../../src/modules/inventory/inventory-service.js';
import { createCatalogFixture } from '../../support/catalog-factories.js';
import { expectLedgerMatchesBalance } from '../../support/inventory-assertions.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('inventory concurrency in PostgreSQL 18', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let actorId: string;
  let magdalenaBranchId: string;
  let magdalenaStockLocationId: string;
  let caborcaBranchId: string;
  let caborcaStockLocationId: string;

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);

    actorId = (
      await database
        .selectFrom('app_user')
        .select('id')
        .where('username', '=', 'admin')
        .executeTakeFirstOrThrow()
    ).id;
    const branches = await database
      .selectFrom('location')
      .innerJoin('stock_location', 'stock_location.branch_id', 'location.id')
      .select(['location.code', 'location.id as branchId', 'stock_location.id as stockLocationId'])
      .where('location.code', 'in', ['MAGDALENA', 'CABORCA'])
      .execute();
    const byCode = new Map(branches.map((branch) => [branch.code, branch]));
    const magdalena = byCode.get('MAGDALENA');
    const caborca = byCode.get('CABORCA');
    if (!magdalena || !caborca) throw new Error('Seeded branch stock locations are missing');
    magdalenaBranchId = magdalena.branchId;
    magdalenaStockLocationId = magdalena.stockLocationId;
    caborcaBranchId = caborca.branchId;
    caborcaStockLocationId = caborca.stockLocationId;
  }, 120_000);

  afterEach(async () => {
    await sql`drop trigger if exists test_inventory_movement_failure on inventory_movement`.execute(
      database,
    );
    await sql`drop function if exists test_reject_inventory_movement()`.execute(database);
    await sql`drop trigger if exists test_inventory_movement_delay on inventory_movement`.execute(
      database,
    );
    await sql`drop function if exists test_delay_inventory_movement()`.execute(database);
  });

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  function context(idempotencyKey = crypto.randomUUID()) {
    return { actorId, idempotencyKey, requestId: crypto.randomUUID() };
  }

  async function quantity(stockLocationId: string, productId: string) {
    return (
      await database
        .selectFrom('inventory_balance')
        .select('quantity')
        .where('stock_location_id', '=', stockLocationId)
        .where('product_id', '=', productId)
        .executeTakeFirstOrThrow()
    ).quantity;
  }

  it('allows only one concurrent request to remove the last unit', async () => {
    const { product } = await createCatalogFixture(database);
    const inventory = new InventoryService(database);
    await inventory.createBranchOperation(
      {
        operationType: 'ENTRY',
        branchId: magdalenaBranchId,
        reason: 'Last-unit fixture',
        lines: [{ productId: product.id, quantity: '1' }],
      },
      context(),
    );

    const removal = {
      operationType: 'MANUAL_EXIT' as const,
      branchId: magdalenaBranchId,
      reason: 'Concurrent last-unit removal',
      lines: [{ productId: product.id, quantity: '1' }],
    };
    const outcomes = await Promise.allSettled([
      inventory.createBranchOperation(removal, context()),
      inventory.createBranchOperation(removal, context()),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'INSUFFICIENT_INVENTORY',
    });
    expect(await quantity(magdalenaStockLocationId, product.id)).toBe('0.000');
    expect(
      await database
        .selectFrom('inventory_movement')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('product_id', '=', product.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '2' });
    await expectLedgerMatchesBalance(database, magdalenaStockLocationId, product.id);
  });

  it('locks products and locations deterministically for opposing multi-product transfers', async () => {
    const fixtures = await Promise.all([
      createCatalogFixture(database),
      createCatalogFixture(database),
    ]);
    const products = fixtures
      .map(({ product }) => product)
      .sort((a, b) => a.id.localeCompare(b.id));
    const inventory = new InventoryService(database);
    const stockLines = products.map((product) => ({ productId: product.id, quantity: '10' }));
    await inventory.createBranchOperation(
      {
        operationType: 'ENTRY',
        branchId: magdalenaBranchId,
        reason: 'Magdalena transfer fixture',
        lines: stockLines,
      },
      context(),
    );
    await inventory.createBranchOperation(
      {
        operationType: 'ENTRY',
        branchId: caborcaBranchId,
        reason: 'Caborca transfer fixture',
        lines: stockLines,
      },
      context(),
    );
    await sql`
      create function test_delay_inventory_movement() returns trigger language plpgsql as $$
      begin perform pg_sleep(0.1); return new; end $$;
      create trigger test_inventory_movement_delay before insert on inventory_movement
      for each row execute function test_delay_inventory_movement()
    `.execute(database);

    const [toCaborca, toMagdalena] = await Promise.all([
      inventory.createTransfer(
        {
          sourceBranchId: magdalenaBranchId,
          destinationBranchId: caborcaBranchId,
          reason: 'Opposing transfer A',
          lines: products.toReversed().map((product) => ({ productId: product.id, quantity: '1' })),
        },
        context(),
      ),
      inventory.createTransfer(
        {
          sourceBranchId: caborcaBranchId,
          destinationBranchId: magdalenaBranchId,
          reason: 'Opposing transfer B',
          lines: products.map((product) => ({ productId: product.id, quantity: '1' })),
        },
        context(),
      ),
    ]);

    for (const product of products) {
      expect(await quantity(magdalenaStockLocationId, product.id)).toBe('10.000');
      expect(await quantity(caborcaStockLocationId, product.id)).toBe('10.000');
      await expectLedgerMatchesBalance(database, magdalenaStockLocationId, product.id);
      await expectLedgerMatchesBalance(database, caborcaStockLocationId, product.id);
    }
    expect(
      await database
        .selectFrom('inventory_movement')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('operation_id', 'in', [toCaborca.id, toMagdalena.id])
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '4' });
  });

  it('keeps the database balance nonnegative even when application logic is bypassed', async () => {
    const { product } = await createCatalogFixture(database);
    await new InventoryService(database).createBranchOperation(
      {
        operationType: 'ENTRY',
        branchId: magdalenaBranchId,
        reason: 'Nonnegative constraint fixture',
        lines: [{ productId: product.id, quantity: '2' }],
      },
      context(),
    );

    await expect(
      database
        .updateTable('inventory_balance')
        .set({ quantity: '-0.001' })
        .where('stock_location_id', '=', magdalenaStockLocationId)
        .where('product_id', '=', product.id)
        .execute(),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await quantity(magdalenaStockLocationId, product.id)).toBe('2.000');
    await expectLedgerMatchesBalance(database, magdalenaStockLocationId, product.id);
  });

  it('rolls back every write when a later movement fails', async () => {
    const fixtures = await Promise.all([
      createCatalogFixture(database),
      createCatalogFixture(database),
    ]);
    const products = fixtures
      .map(({ product }) => product)
      .sort((a, b) => a.id.localeCompare(b.id));
    await database
      .updateTable('product')
      .set({ name: 'Reject movement fixture' })
      .where('id', '=', products[1]!.id)
      .executeTakeFirstOrThrow();
    await sql`
      create function test_reject_inventory_movement() returns trigger language plpgsql as $$
      begin
        if exists (
          select 1 from product where id = new.product_id and name = 'Reject movement fixture'
        ) then
          raise exception 'injected movement failure';
        end if;
        return new;
      end $$;
      create trigger test_inventory_movement_failure before insert on inventory_movement
      for each row execute function test_reject_inventory_movement()
    `.execute(database);
    const rejectedContext = context();
    const operationsBefore = await database
      .selectFrom('inventory_operation')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    await expect(
      new InventoryService(database).createBranchOperation(
        {
          operationType: 'ENTRY',
          branchId: magdalenaBranchId,
          reason: 'Must roll back every line',
          lines: products.map((product) => ({ productId: product.id, quantity: '2' })),
        },
        rejectedContext,
      ),
    ).rejects.toThrow('injected movement failure');

    expect(
      await database
        .selectFrom('inventory_operation')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .executeTakeFirstOrThrow(),
    ).toEqual(operationsBefore);
    expect(
      await database
        .selectFrom('inventory_balance')
        .select('id')
        .where('stock_location_id', '=', magdalenaStockLocationId)
        .where(
          'product_id',
          'in',
          products.map((product) => product.id),
        )
        .execute(),
    ).toHaveLength(0);
    expect(
      await database
        .selectFrom('inventory_movement')
        .select('id')
        .where(
          'product_id',
          'in',
          products.map((product) => product.id),
        )
        .execute(),
    ).toHaveLength(0);
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('commits one operation when the same idempotent request is submitted concurrently', async () => {
    const { product } = await createCatalogFixture(database);
    const inventory = new InventoryService(database);
    const idempotencyKey = crypto.randomUUID();
    const input = {
      operationType: 'ENTRY' as const,
      branchId: magdalenaBranchId,
      reason: 'Concurrent idempotent retry',
      lines: [{ productId: product.id, quantity: '3' }],
    };

    const [first, retry] = await Promise.all([
      inventory.createBranchOperation(input, context(idempotencyKey)),
      inventory.createBranchOperation(input, context(idempotencyKey)),
    ]);

    expect(retry.id).toBe(first.id);
    expect(await quantity(magdalenaStockLocationId, product.id)).toBe('3.000');
    const idempotency = await database
      .selectFrom('idempotency_request')
      .select(['id', 'state', 'resource_id'])
      .where('actor_id', '=', actorId)
      .where('operation_type', '=', 'INVENTORY_ENTRY')
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirstOrThrow();
    expect(idempotency).toMatchObject({ state: 'COMPLETED', resource_id: first.id });
    expect(
      await database
        .selectFrom('inventory_operation')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('idempotency_request_id', '=', idempotency.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '1' });
    expect(
      await database
        .selectFrom('inventory_movement')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('operation_id', '=', first.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '1' });
    expect(
      await database
        .selectFrom('audit_event')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('entity_type', '=', 'INVENTORY_OPERATION')
        .where('entity_id', '=', first.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '1' });
    await expectLedgerMatchesBalance(database, magdalenaStockLocationId, product.id);
  });
});

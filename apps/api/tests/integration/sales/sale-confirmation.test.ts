import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('atomic sale confirmation in PostgreSQL 18', () => {
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

  afterEach(async () => {
    await sql`drop trigger if exists test_reject_sale_audit on audit_event`.execute(database);
    await sql`drop function if exists test_reject_sale_audit_write()`.execute(database);
  });

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  function context(actorId: string, idempotencyKey = crypto.randomUUID()) {
    return { actorId, idempotencyKey, requestId: crypto.randomUUID() };
  }

  async function balance(stockLocationId: string, productId: string) {
    return (
      await database
        .selectFrom('inventory_balance')
        .select('quantity')
        .where('stock_location_id', '=', stockLocationId)
        .where('product_id', '=', productId)
        .executeTakeFirstOrThrow()
    ).quantity;
  }

  it('commits one Sale, ticket, movement, exact snapshot, idempotency result, and audit', async () => {
    const scenario = await createSaleScenario(database, {
      stockQuantity: '5.000',
      standardUnitPrice: '4.2500',
    });
    const command = {
      ...saleCommand({
        customerId: scenario.customer.id,
        routeId: scenario.route.id,
        productId: scenario.product.id,
        quantity: '2.000',
      }),
      paymentMethod: 'CARD' as const,
    };
    const result = await new SaleService(database).confirm(command, context(scenario.driver.id));

    expect(result).toMatchObject({
      paymentMethod: 'CARD',
      total: '8.50',
      ticketNumber: expect.any(String),
    });
    expect(result.lines[0]).toMatchObject({
      productName: scenario.product.name,
      categoryName: scenario.category.name,
      reportingGroup: 'SODAS',
      unitCode: scenario.unit.code,
      quantity: '2.000',
      unitPrice: '4.2500',
      lineAmount: '8.50',
    });
    expect(await balance(scenario.stockLocation.id, scenario.product.id)).toBe('3.000');
    expect(
      await database
        .selectFrom('sale_ticket')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('sale_id', '=', result.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '1' });
    expect(
      await database
        .selectFrom('inventory_movement')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('related_entity_id', '=', result.id)
        .where('related_entity_type', '=', 'SALE')
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '1' });
    expect(
      await database
        .selectFrom('audit_event')
        .select(['actor_id', 'action', 'operation_id'])
        .where('entity_id', '=', result.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      actor_id: scenario.driver.id,
      action: 'SALE_CONFIRMED',
      operation_id: expect.any(String),
    });
  });

  it('replays the same request and rejects changed content under the same key', async () => {
    const scenario = await createSaleScenario(database, { stockQuantity: '3.000' });
    const command = saleCommand({
      customerId: scenario.customer.id,
      routeId: scenario.route.id,
      productId: scenario.product.id,
      quantity: '1.000',
    });
    const shared = context(scenario.driver.id);
    const service = new SaleService(database);
    const first = await service.confirm(command, shared);
    const replay = await service.confirm(command, { ...shared, requestId: crypto.randomUUID() });

    expect(replay).toEqual(first);
    await expect(
      service.confirm(
        { ...command, lines: [{ productId: scenario.product.id, quantity: '2.000' }] },
        shared,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_HASH_CONFLICT' });
    expect(await balance(scenario.stockLocation.id, scenario.product.id)).toBe('2.000');
    expect(
      await database
        .selectFrom('sale')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('client_operation_id', '=', command.clientOperationId)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '1' });
  });

  it('rolls back the Sale, ticket, stock, idempotency row, and success audit when audit fails', async () => {
    const scenario = await createSaleScenario(database, { stockQuantity: '2.000' });
    const countsBefore = await Promise.all(
      (['sale', 'sale_ticket', 'inventory_movement', 'audit_event'] as const).map((table) =>
        database
          .selectFrom(table)
          .select(({ fn }) => fn.countAll<string>().as('count'))
          .executeTakeFirstOrThrow(),
      ),
    );
    await sql`
      create function test_reject_sale_audit_write() returns trigger language plpgsql as $$
      begin
        if new.action = 'SALE_CONFIRMED' then raise exception 'injected sale audit failure'; end if;
        return new;
      end $$;
      create trigger test_reject_sale_audit before insert on audit_event
      for each row execute function test_reject_sale_audit_write()
    `.execute(database);
    const command = saleCommand({
      customerId: scenario.customer.id,
      routeId: scenario.route.id,
      productId: scenario.product.id,
    });
    const rejectedContext = context(scenario.driver.id);

    await expect(new SaleService(database).confirm(command, rejectedContext)).rejects.toThrow(
      'injected sale audit failure',
    );
    expect(await balance(scenario.stockLocation.id, scenario.product.id)).toBe('2.000');
    expect(
      await database
        .selectFrom('sale')
        .select('id')
        .where('client_operation_id', '=', command.clientOperationId)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
    const countsAfter = await Promise.all(
      (['sale', 'sale_ticket', 'inventory_movement', 'audit_event'] as const).map((table) =>
        database
          .selectFrom(table)
          .select(({ fn }) => fn.countAll<string>().as('count'))
          .executeTakeFirstOrThrow(),
      ),
    );
    expect(countsAfter).toEqual(countsBefore);
  });

  it('allows only one simultaneous sale to consume the last route unit', async () => {
    const scenario = await createSaleScenario(database, { stockQuantity: '1.000' });
    const service = new SaleService(database);
    const command = () =>
      saleCommand({
        customerId: scenario.customer.id,
        routeId: scenario.route.id,
        productId: scenario.product.id,
      });
    const outcomes = await Promise.allSettled([
      service.confirm(command(), context(scenario.driver.id)),
      service.confirm(command(), context(scenario.driver.id)),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(rejected?.reason).toMatchObject({ code: 'INSUFFICIENT_INVENTORY' });
    expect(await balance(scenario.stockLocation.id, scenario.product.id)).toBe('0.000');
    const successfulSale = outcomes.find(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<SaleService['confirm']>>> =>
        outcome.status === 'fulfilled',
    );
    expect(
      await database
        .selectFrom('sale_ticket')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('sale_id', '=', successfulSale?.value.id ?? crypto.randomUUID())
        .executeTakeFirstOrThrow(),
    ).toMatchObject({ count: '1' });
  });
});

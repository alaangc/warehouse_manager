import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { CancellationService } from '../../../src/modules/sales/cancellation-service.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('sale cancellation in PostgreSQL 18', () => {
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
    await sql`drop trigger if exists test_reject_cancellation_audit on audit_event`.execute(
      database,
    );
    await sql`drop function if exists test_reject_cancellation_audit_write()`.execute(database);
  });

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  function context(actorId: string, idempotencyKey = crypto.randomUUID()) {
    return { actorId, idempotencyKey, requestId: crypto.randomUUID() };
  }

  async function createCompletedSale() {
    const scenario = await createSaleScenario(database, { stockQuantity: '3.000' });
    const sale = await new SaleService(database).confirm(
      saleCommand({
        customerId: scenario.customer.id,
        routeId: scenario.route.id,
        productId: scenario.product.id,
        quantity: '2.000',
      }),
      context(scenario.driver.id),
    );
    return { scenario, sale };
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

  it('restores stock to an En Route route exactly once with a same-transaction audit', async () => {
    const { scenario, sale } = await createCompletedSale();
    const service = new CancellationService(database);
    const result = await service.cancel(
      sale.id,
      'Customer returned the complete order',
      context(scenario.admin.id),
    );

    expect(result).toMatchObject({
      saleId: sale.id,
      status: 'CANCELLED',
      destinationStockLocationId: scenario.stockLocation.id,
    });
    expect(await quantity(scenario.stockLocation.id, scenario.product.id)).toBe('3.000');
    expect(
      await database
        .selectFrom('sale')
        .select(['status', 'cancellation_reason', 'cancelled_by'])
        .where('id', '=', sale.id)
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      status: 'CANCELLED',
      cancellation_reason: 'Customer returned the complete order',
      cancelled_by: scenario.admin.id,
    });
    const cancellation = await database
      .selectFrom('sale_cancellation')
      .select(['id', 'inventory_operation_id'])
      .where('sale_id', '=', sale.id)
      .executeTakeFirstOrThrow();
    expect(
      await database
        .selectFrom('audit_event')
        .select(['action', 'reason', 'operation_id'])
        .where('entity_id', '=', sale.id)
        .where('action', '=', 'SALE_CANCELLED')
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      action: 'SALE_CANCELLED',
      reason: 'Customer returned the complete order',
      operation_id: cancellation.inventory_operation_id,
    });
    await expect(
      service.cancel(sale.id, 'Second attempt', context(scenario.admin.id)),
    ).rejects.toMatchObject({ code: 'SALE_ALREADY_CANCELLED' });
  });

  it.each(['RETURNED', 'CLOSED'] as const)(
    'restores stock to the origin branch after the route is %s',
    async (state) => {
      const { scenario, sale } = await createCompletedSale();
      await database
        .updateTable('route')
        .set({
          state,
          returned_at: new Date(),
          ...(state === 'CLOSED'
            ? { closed_at: new Date(), closed_by: scenario.admin.id }
            : { closed_at: null, closed_by: null }),
        })
        .where('id', '=', scenario.route.id)
        .executeTakeFirstOrThrow();

      const result = await new CancellationService(database).cancel(
        sale.id,
        `Cancellation after ${state}`,
        context(scenario.admin.id),
      );
      expect(result.destinationStockLocationId).toBe(scenario.origin.stockLocationId);
      expect(await quantity(scenario.origin.stockLocationId, scenario.product.id)).toBe('2.000');
      expect(await quantity(scenario.stockLocation.id, scenario.product.id)).toBe('1.000');
    },
  );

  it('rolls back status, stock, cancellation, idempotency, and movement when audit insertion fails', async () => {
    const { scenario, sale } = await createCompletedSale();
    await sql`
      create function test_reject_cancellation_audit_write() returns trigger language plpgsql as $$
      begin
        if new.action = 'SALE_CANCELLED' then raise exception 'injected cancellation audit failure'; end if;
        return new;
      end $$;
      create trigger test_reject_cancellation_audit before insert on audit_event
      for each row execute function test_reject_cancellation_audit_write()
    `.execute(database);
    const rejectedContext = context(scenario.admin.id);
    const movementsBefore = await database
      .selectFrom('inventory_movement')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('related_entity_id', '=', sale.id)
      .executeTakeFirstOrThrow();
    const cancellationAuditsBefore = await database
      .selectFrom('audit_event')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('entity_id', '=', sale.id)
      .where('action', '=', 'SALE_CANCELLED')
      .executeTakeFirstOrThrow();

    await expect(
      new CancellationService(database).cancel(
        sale.id,
        'Must roll back completely',
        rejectedContext,
      ),
    ).rejects.toThrow('injected cancellation audit failure');
    expect(await quantity(scenario.stockLocation.id, scenario.product.id)).toBe('1.000');
    expect(
      await database
        .selectFrom('sale')
        .select(['status', 'cancelled_at'])
        .where('id', '=', sale.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: 'COMPLETED', cancelled_at: null });
    expect(
      await database
        .selectFrom('sale_cancellation')
        .select('id')
        .where('sale_id', '=', sale.id)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await database
        .selectFrom('inventory_movement')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('related_entity_id', '=', sale.id)
        .executeTakeFirstOrThrow(),
    ).toEqual(movementsBefore);
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await database
        .selectFrom('audit_event')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('entity_id', '=', sale.id)
        .where('action', '=', 'SALE_CANCELLED')
        .executeTakeFirstOrThrow(),
    ).toEqual(cancellationAuditsBefore);
  });
});

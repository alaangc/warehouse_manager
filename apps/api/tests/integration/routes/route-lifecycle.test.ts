import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { RouteLoadService } from '../../../src/modules/routes/route-load-service.js';
import { RouteReconciliationService } from '../../../src/modules/routes/route-reconciliation-service.js';
import { RouteTransitionService } from '../../../src/modules/routes/route-transition-service.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

type CreatedRoute = Awaited<ReturnType<RouteLoadService['create']>>;

interface ProductFixture {
  id: string;
  name: string;
}

interface RouteScenario {
  driverId: string;
  vehicleId: string;
  route: CreatedRoute;
  routeStockId: string;
  products: ProductFixture[];
}

describe('route lifecycle in PostgreSQL 18', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let adminId: string;
  let seededPasswordHash: string;
  let originId: string;
  let originStockId: string;

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
    const admin = await database
      .selectFrom('app_user')
      .select('id')
      .where('username', '=', 'admin')
      .executeTakeFirstOrThrow();
    adminId = admin.id;
    const driver = await database
      .selectFrom('app_user')
      .select('password_hash')
      .where('username', '=', 'driver')
      .executeTakeFirstOrThrow();
    seededPasswordHash = driver.password_hash;
    const origin = await database
      .selectFrom('location')
      .innerJoin('stock_location', 'stock_location.branch_id', 'location.id')
      .select(['location.id', 'stock_location.id as stockLocationId'])
      .where('location.code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    originId = origin.id;
    originStockId = origin.stockLocationId;
  }, 120_000);

  afterEach(async () => {
    await sql`drop trigger if exists test_reject_route_audit on audit_event`.execute(database);
    await sql`drop function if exists test_reject_route_audit_write()`.execute(database);
  });

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  function routeContext(actorId: string) {
    return { actorId, requestId: crypto.randomUUID() };
  }

  function commandContext(actorId: string) {
    return {
      actorId,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    };
  }

  async function createDriver(): Promise<string> {
    const suffix = crypto.randomUUID();
    const driver = await database
      .insertInto('app_user')
      .values({
        username: `route-driver-${suffix}`,
        display_name: `Route driver ${suffix}`,
        password_hash: seededPasswordHash,
        role: 'DRIVER',
        active: true,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return driver.id;
  }

  async function createVehicle(): Promise<string> {
    const suffix = crypto.randomUUID();
    const vehicle = await database
      .insertInto('vehicle')
      .values({
        code: `ROUTE-${suffix}`,
        name: `Route vehicle ${suffix}`,
        registration: null,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return vehicle.id;
  }

  async function createProduct(initialQuantity = '10.000'): Promise<ProductFixture> {
    const suffix = crypto.randomUUID();
    const unit = await database
      .insertInto('unit')
      .values({
        code: `ROUTE-${suffix}`,
        name: `Route unit ${suffix}`,
        quantity_scale: 3,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const category = await database
      .insertInto('category')
      .values({
        name: `Route category ${suffix}`,
        reporting_group: 'OTHER',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const product = await database
      .insertInto('product')
      .values({
        sku: `ROUTE-${suffix}`,
        name: `Route product ${suffix}`,
        description: null,
        category_id: category.id,
        unit_id: unit.id,
        standard_unit_price: '10.0000',
        low_stock_threshold: '1.000',
        archived_at: null,
      })
      .returning(['id', 'name'])
      .executeTakeFirstOrThrow();
    await database
      .insertInto('inventory_balance')
      .values({
        stock_location_id: originStockId,
        product_id: product.id,
        quantity: initialQuantity,
      })
      .execute();
    return product;
  }

  async function createScenario(productCount = 1): Promise<RouteScenario> {
    const [driverId, vehicleId] = await Promise.all([createDriver(), createVehicle()]);
    const products = await Promise.all(Array.from({ length: productCount }, () => createProduct()));
    const route = await new RouteLoadService(database).create(
      {
        routeNumber: `R-${crypto.randomUUID()}`,
        originLocationId: originId,
        driverId,
        vehicleId,
        businessDate: '2026-09-03',
      },
      routeContext(adminId),
    );
    const routeStock = await database
      .selectFrom('stock_location')
      .select('id')
      .where('route_id', '=', route.id)
      .executeTakeFirstOrThrow();
    return { driverId, vehicleId, route, routeStockId: routeStock.id, products };
  }

  async function draftAndConfirm(
    scenario: RouteScenario,
    quantities = scenario.products.map(() => '5.000'),
  ) {
    const service = new RouteLoadService(database);
    const draft = await service.saveDraft(
      scenario.route.id,
      scenario.route.version,
      scenario.products.map((product, index) => ({
        productId: product.id,
        quantity: quantities[index]!,
      })),
      routeContext(scenario.driverId),
    );
    const context = commandContext(scenario.driverId);
    const confirmed = await service.confirm(scenario.route.id, draft.version, context);
    return { draft, confirmed, context };
  }

  async function moveToReturned(scenario: RouteScenario) {
    const load = await draftAndConfirm(scenario);
    const transitions = new RouteTransitionService(database);
    const started = await transitions.transition(
      scenario.route.id,
      'START',
      scenario.route.version,
      commandContext(scenario.driverId),
    );
    const returned = await transitions.transition(
      scenario.route.id,
      'RETURN',
      started.version,
      commandContext(scenario.driverId),
    );
    return { ...load, started, returned };
  }

  async function reconcileExact(scenario: RouteScenario, expectedVersion: number) {
    return new RouteReconciliationService(database).approve(
      scenario.route.id,
      {
        expectedVersion,
        lines: scenario.products.map((product) => ({
          productId: product.id,
          physicalReturnQuantity: '5.000',
        })),
      },
      commandContext(adminId),
    );
  }

  async function balance(stockLocationId: string, productId: string): Promise<string | undefined> {
    return (
      await database
        .selectFrom('inventory_balance')
        .select('quantity')
        .where('stock_location_id', '=', stockLocationId)
        .where('product_id', '=', productId)
        .executeTakeFirst()
    )?.quantity;
  }

  async function rejectAuditWrites(): Promise<void> {
    await sql`
      create function test_reject_route_audit_write() returns trigger language plpgsql as $$
      begin raise exception 'injected route audit failure'; end $$;
      create trigger test_reject_route_audit before insert on audit_event
      for each row execute function test_reject_route_audit_write()
    `.execute(database);
  }

  it('rolls back the complete multi-product load when any product lacks stock', async () => {
    const scenario = await createScenario(2);
    const ordered = [...scenario.products].sort((left, right) => left.id.localeCompare(right.id));
    await database
      .updateTable('inventory_balance')
      .set({ quantity: '5.000' })
      .where('stock_location_id', '=', originStockId)
      .where('product_id', '=', ordered[0]!.id)
      .execute();
    await database
      .updateTable('inventory_balance')
      .set({ quantity: '1.000' })
      .where('stock_location_id', '=', originStockId)
      .where('product_id', '=', ordered[1]!.id)
      .execute();
    const service = new RouteLoadService(database);
    const draft = await service.saveDraft(
      scenario.route.id,
      scenario.route.version,
      ordered.map((product) => ({ productId: product.id, quantity: '2.000' })),
      routeContext(scenario.driverId),
    );
    const rejectedContext = commandContext(scenario.driverId);

    await expect(
      service.confirm(scenario.route.id, draft.version, rejectedContext),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_INVENTORY' });

    expect(await balance(originStockId, ordered[0]!.id)).toBe('5.000');
    expect(await balance(originStockId, ordered[1]!.id)).toBe('1.000');
    expect(await balance(scenario.routeStockId, ordered[0]!.id)).toBeUndefined();
    expect(await balance(scenario.routeStockId, ordered[1]!.id)).toBeUndefined();
    expect(
      await database
        .selectFrom('route_load')
        .select(['state', 'inventory_operation_id', 'version'])
        .where('route_id', '=', scenario.route.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'DRAFT', inventory_operation_id: null, version: draft.version });
    expect(
      await database
        .selectFrom('inventory_movement')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where((expression) =>
          expression.or([
            expression('source_stock_location_id', '=', scenario.routeStockId),
            expression('destination_stock_location_id', '=', scenario.routeStockId),
          ]),
        )
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: '0' });
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('prevents simultaneous active assignment of either a driver or a vehicle', async () => {
    const sharedDriver = await createDriver();
    const [firstVehicle, secondVehicle] = await Promise.all([createVehicle(), createVehicle()]);
    const service = new RouteLoadService(database);
    const create = (driverId: string, vehicleId: string) =>
      service.create(
        {
          routeNumber: `R-${crypto.randomUUID()}`,
          originLocationId: originId,
          driverId,
          vehicleId,
          businessDate: '2026-09-03',
        },
        routeContext(adminId),
      );
    const driverOutcomes = await Promise.allSettled([
      create(sharedDriver, firstVehicle),
      create(sharedDriver, secondVehicle),
    ]);
    expect(driverOutcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const driverRejection = driverOutcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(driverRejection?.reason).toMatchObject({ code: '23505' });
    expect(
      await database
        .selectFrom('route')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('driver_id', '=', sharedDriver)
        .where('state', 'in', ['PREPARING', 'EN_ROUTE', 'RETURNED'])
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: '1' });

    const sharedVehicle = await createVehicle();
    const [firstDriver, secondDriver] = await Promise.all([createDriver(), createDriver()]);
    const vehicleOutcomes = await Promise.allSettled([
      create(firstDriver, sharedVehicle),
      create(secondDriver, sharedVehicle),
    ]);
    expect(vehicleOutcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const vehicleRejection = vehicleOutcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(vehicleRejection?.reason).toMatchObject({ code: '23505' });
    expect(
      await database
        .selectFrom('route')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('vehicle_id', '=', sharedVehicle)
        .where('state', 'in', ['PREPARING', 'EN_ROUTE', 'RETURNED'])
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: '1' });
  });

  it('records route stock movements, both difference signs, zero-at-close, and every audit', async () => {
    const scenario = await createScenario(2);
    const [shortageProduct, overageProduct] = scenario.products;
    const lifecycle = await moveToReturned(scenario);
    const reconciliationContext = commandContext(adminId);
    const reconciliation = await new RouteReconciliationService(database).approve(
      scenario.route.id,
      {
        expectedVersion: lifecycle.returned.version,
        lines: [
          {
            productId: shortageProduct!.id,
            physicalReturnQuantity: '4.000',
            differenceReason: 'One unit damaged',
          },
          {
            productId: overageProduct!.id,
            physicalReturnQuantity: '6.000',
            differenceReason: 'One unit found during count',
          },
        ],
      },
      reconciliationContext,
    );
    const closed = await new RouteReconciliationService(database).close(
      scenario.route.id,
      lifecycle.returned.version,
      commandContext(adminId),
    );

    expect(closed).toMatchObject({ state: 'CLOSED', version: 4, closed_by: adminId });
    expect(await balance(scenario.routeStockId, shortageProduct!.id)).toBe('0.000');
    expect(await balance(scenario.routeStockId, overageProduct!.id)).toBe('0.000');
    expect(await balance(originStockId, shortageProduct!.id)).toBe('9.000');
    expect(await balance(originStockId, overageProduct!.id)).toBe('11.000');

    const lines = await database
      .selectFrom('route_reconciliation_line')
      .select([
        'product_id',
        'loaded_quantity',
        'sold_quantity',
        'physical_return_quantity',
        'difference_quantity',
        'difference_reason',
        'adjustment_movement_id',
      ])
      .where('route_reconciliation_id', '=', reconciliation.id)
      .execute();
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_id: shortageProduct!.id,
          loaded_quantity: '5.000',
          sold_quantity: '0.000',
          physical_return_quantity: '4.000',
          difference_quantity: '1.000',
          difference_reason: 'One unit damaged',
          adjustment_movement_id: expect.any(String),
        }),
        expect.objectContaining({
          product_id: overageProduct!.id,
          loaded_quantity: '5.000',
          sold_quantity: '0.000',
          physical_return_quantity: '6.000',
          difference_quantity: '-1.000',
          difference_reason: 'One unit found during count',
          adjustment_movement_id: expect.any(String),
        }),
      ]),
    );

    const movements = await database
      .selectFrom('inventory_movement as movement')
      .innerJoin('inventory_operation as operation', 'operation.id', 'movement.operation_id')
      .select([
        'operation.operation_type as operationType',
        'movement.product_id as productId',
        'movement.source_stock_location_id as sourceId',
        'movement.destination_stock_location_id as destinationId',
        'movement.quantity',
        'movement.reason',
      ])
      .where((expression) =>
        expression.or([
          expression('movement.source_stock_location_id', '=', scenario.routeStockId),
          expression('movement.destination_stock_location_id', '=', scenario.routeStockId),
        ]),
      )
      .execute();
    expect(movements).toHaveLength(6);
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationType: 'NEGATIVE_ADJUSTMENT',
          productId: shortageProduct!.id,
          sourceId: scenario.routeStockId,
          destinationId: null,
          quantity: '1.000',
          reason: 'One unit damaged',
        }),
        expect.objectContaining({
          operationType: 'POSITIVE_ADJUSTMENT',
          productId: overageProduct!.id,
          sourceId: null,
          destinationId: scenario.routeStockId,
          quantity: '1.000',
          reason: 'One unit found during count',
        }),
        expect.objectContaining({
          operationType: 'ROUTE_RETURN',
          productId: shortageProduct!.id,
          sourceId: scenario.routeStockId,
          destinationId: originStockId,
          quantity: '4.000',
        }),
        expect.objectContaining({
          operationType: 'ROUTE_RETURN',
          productId: overageProduct!.id,
          sourceId: scenario.routeStockId,
          destinationId: originStockId,
          quantity: '6.000',
        }),
      ]),
    );
    expect(movements.filter((movement) => movement.operationType === 'ROUTE_LOAD')).toHaveLength(2);

    const audits = await database
      .selectFrom('audit_event')
      .select(['actor_id', 'action', 'entity_type', 'entity_id', 'after_values'])
      .where((expression) =>
        expression.or([
          expression('entity_id', '=', scenario.route.id),
          expression('entity_id', '=', lifecycle.confirmed.id),
          expression('entity_id', '=', reconciliation.id),
        ]),
      )
      .orderBy('occurred_at')
      .execute();
    expect(audits).toHaveLength(6);
    expect(audits.every((audit) => audit.action === 'ROUTE_CHANGED')).toBe(true);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_id: adminId,
          entity_type: 'ROUTE',
          entity_id: scenario.route.id,
          after_values: expect.objectContaining({ state: 'PREPARING' }),
        }),
        expect.objectContaining({
          actor_id: scenario.driverId,
          entity_type: 'ROUTE_LOAD',
          entity_id: lifecycle.confirmed.id,
          after_values: expect.objectContaining({ state: 'CONFIRMED', lineCount: 2 }),
        }),
        expect.objectContaining({
          actor_id: scenario.driverId,
          entity_type: 'ROUTE',
          after_values: expect.objectContaining({ state: 'EN_ROUTE' }),
        }),
        expect.objectContaining({
          actor_id: scenario.driverId,
          entity_type: 'ROUTE',
          after_values: expect.objectContaining({ state: 'RETURNED' }),
        }),
        expect.objectContaining({
          actor_id: adminId,
          entity_type: 'ROUTE_RECONCILIATION',
          entity_id: reconciliation.id,
          after_values: expect.objectContaining({ state: 'APPROVED', lineCount: 2 }),
        }),
        expect.objectContaining({
          actor_id: adminId,
          entity_type: 'ROUTE',
          after_values: expect.objectContaining({ state: 'CLOSED' }),
        }),
      ]),
    );
  });

  it('keeps confirmed load data and a Closed route immutable through ordinary commands', async () => {
    const scenario = await createScenario();
    const lifecycle = await moveToReturned(scenario);
    await reconcileExact(scenario, lifecycle.returned.version);
    const closed = await new RouteReconciliationService(database).close(
      scenario.route.id,
      lifecycle.returned.version,
      commandContext(adminId),
    );
    const loadLine = await database
      .selectFrom('route_load_line')
      .select('id')
      .where('route_load_id', '=', lifecycle.confirmed.id)
      .executeTakeFirstOrThrow();

    await expect(
      database
        .updateTable('route_load_line')
        .set({ quantity: '6.000' })
        .where('id', '=', loadLine.id)
        .execute(),
    ).rejects.toThrow('confirmed route load is immutable');
    await expect(
      database.deleteFrom('route_load_line').where('id', '=', loadLine.id).execute(),
    ).rejects.toThrow('confirmed route load is immutable');
    await expect(
      new RouteLoadService(database).saveDraft(
        scenario.route.id,
        lifecycle.confirmed.version,
        [{ productId: scenario.products[0]!.id, quantity: '1.000' }],
        routeContext(scenario.driverId),
      ),
    ).rejects.toMatchObject({ code: 'ROUTE_NOT_PREPARING' });
    await expect(
      new RouteTransitionService(database).transition(
        scenario.route.id,
        'RETURN',
        closed.version,
        commandContext(scenario.driverId),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ROUTE_TRANSITION' });
    await expect(
      new RouteReconciliationService(database).approve(
        scenario.route.id,
        {
          expectedVersion: closed.version,
          lines: [{ productId: scenario.products[0]!.id, physicalReturnQuantity: '0.000' }],
        },
        commandContext(adminId),
      ),
    ).rejects.toMatchObject({ code: 'ROUTE_NOT_RETURNED' });
    await expect(
      new RouteReconciliationService(database).close(
        scenario.route.id,
        closed.version,
        commandContext(adminId),
      ),
    ).rejects.toMatchObject({ code: 'ROUTE_NOT_RETURNED' });

    expect(
      await database
        .selectFrom('route')
        .select(['state', 'version', 'closed_by'])
        .where('id', '=', scenario.route.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'CLOSED', version: closed.version, closed_by: adminId });
    expect(
      await database
        .selectFrom('route_load_line')
        .select('quantity')
        .where('id', '=', loadLine.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ quantity: '5.000' });
  });

  it('rolls back route creation when its audit cannot be written', async () => {
    const [driverId, vehicleId] = await Promise.all([createDriver(), createVehicle()]);
    const routeNumber = `R-${crypto.randomUUID()}`;
    await rejectAuditWrites();

    await expect(
      new RouteLoadService(database).create(
        {
          routeNumber,
          originLocationId: originId,
          driverId,
          vehicleId,
          businessDate: '2026-09-03',
        },
        routeContext(adminId),
      ),
    ).rejects.toThrow('injected route audit failure');
    expect(
      await database
        .selectFrom('route')
        .select('id')
        .where('route_number', '=', routeNumber)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await database
        .selectFrom('stock_location')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where('kind', '=', 'ROUTE')
        .where('route_id', 'is', null)
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: '0' });
  });

  it('rolls back load confirmation when its audit cannot be written', async () => {
    const scenario = await createScenario();
    const service = new RouteLoadService(database);
    const draft = await service.saveDraft(
      scenario.route.id,
      scenario.route.version,
      [{ productId: scenario.products[0]!.id, quantity: '5.000' }],
      routeContext(scenario.driverId),
    );
    const rejectedContext = commandContext(scenario.driverId);
    await rejectAuditWrites();

    await expect(
      service.confirm(scenario.route.id, draft.version, rejectedContext),
    ).rejects.toThrow('injected route audit failure');
    expect(await balance(originStockId, scenario.products[0]!.id)).toBe('10.000');
    expect(await balance(scenario.routeStockId, scenario.products[0]!.id)).toBeUndefined();
    expect(
      await database
        .selectFrom('route_load')
        .select(['state', 'inventory_operation_id', 'version'])
        .where('route_id', '=', scenario.route.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'DRAFT', inventory_operation_id: null, version: draft.version });
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('rolls back route start when its audit cannot be written', async () => {
    const scenario = await createScenario();
    await draftAndConfirm(scenario);
    const rejectedContext = commandContext(scenario.driverId);
    await rejectAuditWrites();

    await expect(
      new RouteTransitionService(database).transition(
        scenario.route.id,
        'START',
        scenario.route.version,
        rejectedContext,
      ),
    ).rejects.toThrow('injected route audit failure');
    expect(
      await database
        .selectFrom('route')
        .select(['state', 'started_at', 'version'])
        .where('id', '=', scenario.route.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'PREPARING', started_at: null, version: scenario.route.version });
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('rolls back route return when its audit cannot be written', async () => {
    const scenario = await createScenario();
    await draftAndConfirm(scenario);
    const started = await new RouteTransitionService(database).transition(
      scenario.route.id,
      'START',
      scenario.route.version,
      commandContext(scenario.driverId),
    );
    const rejectedContext = commandContext(scenario.driverId);
    await rejectAuditWrites();

    await expect(
      new RouteTransitionService(database).transition(
        scenario.route.id,
        'RETURN',
        started.version,
        rejectedContext,
      ),
    ).rejects.toThrow('injected route audit failure');
    expect(
      await database
        .selectFrom('route')
        .select(['state', 'returned_at', 'version'])
        .where('id', '=', scenario.route.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'EN_ROUTE', returned_at: null, version: started.version });
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('rolls back reconciliation, movements, balances, and idempotency when audit fails', async () => {
    const scenario = await createScenario();
    const lifecycle = await moveToReturned(scenario);
    const rejectedContext = commandContext(adminId);
    const movementsBefore = await database
      .selectFrom('inventory_movement')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where((expression) =>
        expression.or([
          expression('source_stock_location_id', '=', scenario.routeStockId),
          expression('destination_stock_location_id', '=', scenario.routeStockId),
        ]),
      )
      .executeTakeFirstOrThrow();
    await rejectAuditWrites();

    await expect(
      new RouteReconciliationService(database).approve(
        scenario.route.id,
        {
          expectedVersion: lifecycle.returned.version,
          lines: [
            {
              productId: scenario.products[0]!.id,
              physicalReturnQuantity: '4.000',
              differenceReason: 'Must roll back',
            },
          ],
        },
        rejectedContext,
      ),
    ).rejects.toThrow('injected route audit failure');
    expect(await balance(originStockId, scenario.products[0]!.id)).toBe('5.000');
    expect(await balance(scenario.routeStockId, scenario.products[0]!.id)).toBe('5.000');
    expect(
      await database
        .selectFrom('route_reconciliation')
        .select('id')
        .where('route_id', '=', scenario.route.id)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await database
        .selectFrom('inventory_movement')
        .select(({ fn }) => fn.countAll<string>().as('count'))
        .where((expression) =>
          expression.or([
            expression('source_stock_location_id', '=', scenario.routeStockId),
            expression('destination_stock_location_id', '=', scenario.routeStockId),
          ]),
        )
        .executeTakeFirstOrThrow(),
    ).toEqual(movementsBefore);
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('rolls back route closure when its audit cannot be written', async () => {
    const scenario = await createScenario();
    const lifecycle = await moveToReturned(scenario);
    await reconcileExact(scenario, lifecycle.returned.version);
    const rejectedContext = commandContext(adminId);
    await rejectAuditWrites();

    await expect(
      new RouteReconciliationService(database).close(
        scenario.route.id,
        lifecycle.returned.version,
        rejectedContext,
      ),
    ).rejects.toThrow('injected route audit failure');
    expect(
      await database
        .selectFrom('route')
        .select(['state', 'closed_at', 'closed_by', 'version'])
        .where('id', '=', scenario.route.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      state: 'RETURNED',
      closed_at: null,
      closed_by: null,
      version: lifecycle.returned.version,
    });
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', rejectedContext.idempotencyKey)
        .executeTakeFirst(),
    ).toBeUndefined();
  });
});

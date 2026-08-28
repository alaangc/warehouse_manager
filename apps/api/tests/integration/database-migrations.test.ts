import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../src/db/database.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import { InventoryService } from '../../src/modules/inventory/inventory-service.js';
import { RouteLoadService } from '../../src/modules/routes/route-load-service.js';
import { RouteReconciliationService } from '../../src/modules/routes/route-reconciliation-service.js';
import { RouteRepository } from '../../src/modules/routes/route-repository.js';
import { RouteTransitionService } from '../../src/modules/routes/route-transition-service.js';
import { SaleService } from '../../src/modules/sales/sale-service.js';
import { CancellationService } from '../../src/modules/sales/cancellation-service.js';
import { startPostgres, type TestDatabase } from '../support/postgres-container.js';
import { resetDatabase } from '../support/reset-database.js';

describe('PostgreSQL 18 migrations', () => {
  let container: TestDatabase;
  let database: AppDatabase;

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
  }, 120_000);

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  it('creates deterministic settings, users, branches, and branch stock locations', async () => {
    const settings = await database
      .selectFrom('business_setting')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(settings).toMatchObject({
      currency_code: 'MXN',
      business_timezone: 'America/Hermosillo',
      partner_share_rate: '0.500000',
    });
    const locations = await database
      .selectFrom('location')
      .innerJoin('stock_location', 'stock_location.branch_id', 'location.id')
      .select('location.code')
      .orderBy('location.code')
      .execute();
    expect(locations.map((row) => row.code)).toEqual(['CABORCA', 'MAGDALENA']);
  });

  it('enforces nonnegative balances and immutable movement history in PostgreSQL', async () => {
    await expect(
      sql`insert into inventory_balance (stock_location_id, product_id, quantity) values (gen_random_uuid(), gen_random_uuid(), -1)`.execute(
        database,
      ),
    ).rejects.toBeTruthy();
    const trigger = await sql<{
      count: string;
    }>`select count(*)::text as count from pg_trigger where tgname = 'inventory_movement_immutable'`.execute(
      database,
    );
    expect(trigger.rows[0]?.count).toBe('1');
  });

  it('installs the active customer-price exclusion constraint', async () => {
    const constraint = await sql<{
      exists: boolean;
    }>`select exists(select 1 from pg_constraint where conname = 'customer_price_active_no_overlap') as exists`.execute(
      database,
    );
    expect(constraint.rows[0]?.exists).toBe(true);
  });

  it('commits inventory, idempotency, movements, balances, and audit atomically', async () => {
    const actor = await database
      .selectFrom('app_user')
      .select('id')
      .where('username', '=', 'admin')
      .executeTakeFirstOrThrow();
    const branches = await database.selectFrom('location').select(['id', 'code']).execute();
    const category = await database
      .insertInto('category')
      .values({ name: `Test ${crypto.randomUUID()}`, reporting_group: 'OTHER', archived_at: null })
      .returning('id')
      .executeTakeFirstOrThrow();
    const unit = await database
      .insertInto('unit')
      .values({
        code: `T-${crypto.randomUUID()}`,
        name: 'Test unit',
        quantity_scale: 0,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const product = await database
      .insertInto('product')
      .values({
        sku: `T-${crypto.randomUUID()}`,
        name: 'Concurrent product',
        description: null,
        category_id: category.id,
        unit_id: unit.id,
        standard_unit_price: '10.0000',
        low_stock_threshold: '1.000',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const sourceBranch = branches.find((branch) => branch.code === 'MAGDALENA')!;
    const service = new InventoryService(database);
    const input = {
      operationType: 'ENTRY' as const,
      branchId: sourceBranch.id,
      reason: 'Integration fixture',
      lines: [{ productId: product.id, quantity: '1' }],
    };
    const context = {
      actorId: actor.id,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    };
    const first = await service.createBranchOperation(input, context);
    const replay = await service.createBranchOperation(input, context);
    expect(replay.id).toBe(first.id);
    const operationCount = await database
      .selectFrom('inventory_operation')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('id', '=', first.id)
      .executeTakeFirstOrThrow();
    expect(operationCount.count).toBe('1');

    const exits = await Promise.allSettled([
      service.createBranchOperation(
        {
          operationType: 'MANUAL_EXIT',
          branchId: sourceBranch.id,
          reason: 'Concurrent A',
          lines: [{ productId: product.id, quantity: '1' }],
        },
        { actorId: actor.id, idempotencyKey: crypto.randomUUID(), requestId: crypto.randomUUID() },
      ),
      service.createBranchOperation(
        {
          operationType: 'MANUAL_EXIT',
          branchId: sourceBranch.id,
          reason: 'Concurrent B',
          lines: [{ productId: product.id, quantity: '1' }],
        },
        { actorId: actor.id, idempotencyKey: crypto.randomUUID(), requestId: crypto.randomUUID() },
      ),
    ]);
    expect(exits.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(exits.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const stock = await database
      .selectFrom('stock_location')
      .select('id')
      .where('branch_id', '=', sourceBranch.id)
      .executeTakeFirstOrThrow();
    const balance = await database
      .selectFrom('inventory_balance')
      .select('quantity')
      .where('stock_location_id', '=', stock.id)
      .where('product_id', '=', product.id)
      .executeTakeFirstOrThrow();
    expect(balance.quantity).toBe('0.000');
    const audits = await database
      .selectFrom('audit_event')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('entity_type', '=', 'INVENTORY_OPERATION')
      .executeTakeFirstOrThrow();
    expect(Number(audits.count)).toBeGreaterThanOrEqual(2);
  });

  it('confirms and replays one exact sale, preserves its ticket, and cancels once', async () => {
    const admin = await database
      .selectFrom('app_user')
      .select('id')
      .where('username', '=', 'admin')
      .executeTakeFirstOrThrow();
    const driver = await database
      .insertInto('app_user')
      .values({
        username: `route-driver-${crypto.randomUUID()}`,
        display_name: 'Route lifecycle driver',
        password_hash: 'not-used-by-this-integration-test',
        role: 'DRIVER',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const branch = await database
      .selectFrom('location')
      .select('id')
      .where('code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    const category = await database
      .insertInto('category')
      .values({ name: `Sale ${crypto.randomUUID()}`, reporting_group: 'SODAS', archived_at: null })
      .returning('id')
      .executeTakeFirstOrThrow();
    const unit = await database
      .insertInto('unit')
      .values({
        code: `S-${crypto.randomUUID()}`,
        name: 'Bottle',
        quantity_scale: 0,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const product = await database
      .insertInto('product')
      .values({
        sku: `S-${crypto.randomUUID()}`,
        name: 'Sale product',
        description: null,
        category_id: category.id,
        unit_id: unit.id,
        standard_unit_price: '10.0000',
        low_stock_threshold: '1.000',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const customer = await database
      .insertInto('customer')
      .values({
        customer_number: `C-${crypto.randomUUID()}`,
        display_name: 'Test customer',
        contact_name: null,
        phone: null,
        email: null,
        address: null,
        city: 'Magdalena',
        notes: null,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await database
      .insertInto('customer_price')
      .values({
        customer_id: customer.id,
        product_id: product.id,
        unit_price: '8.1234',
        valid_from: new Date(Date.now() - 60_000),
        valid_to: null,
        created_by: admin.id,
      })
      .execute();
    const vehicle = await database
      .insertInto('vehicle')
      .values({
        code: `V-${crypto.randomUUID()}`,
        name: 'Sale vehicle',
        registration: null,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const route = await database
      .insertInto('route')
      .values({
        route_number: `R-${crypto.randomUUID()}`,
        state: 'EN_ROUTE',
        origin_location_id: branch.id,
        driver_id: driver.id,
        vehicle_id: vehicle.id,
        business_date: '2026-08-27',
        created_by: admin.id,
        started_at: new Date(),
        returned_at: null,
        closed_at: null,
        closed_by: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const routeStock = await database
      .insertInto('stock_location')
      .values({ kind: 'ROUTE', branch_id: null, route_id: route.id })
      .returning('id')
      .executeTakeFirstOrThrow();
    await database
      .insertInto('inventory_balance')
      .values({ stock_location_id: routeStock.id, product_id: product.id, quantity: '2.000' })
      .execute();

    const command = {
      clientOperationId: crypto.randomUUID(),
      customerId: customer.id,
      routeId: route.id,
      paymentMethod: 'CASH' as const,
      lines: [{ productId: product.id, quantity: '1' }],
    };
    const context = {
      actorId: driver.id,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    };
    const service = new SaleService(database);
    const sale = (await service.confirm(command, context)) as {
      id: string;
      total: string;
      ticketNumber: string;
    };
    const replay = (await service.confirm(command, context)) as unknown as { id: string };
    expect(replay.id).toBe(sale.id);
    expect(sale.total).toBe('8.12');
    const ticket = await database
      .selectFrom('sale_ticket')
      .selectAll()
      .where('sale_id', '=', sale.id)
      .executeTakeFirstOrThrow();
    expect(ticket.ticket_number).toBe(sale.ticketNumber);
    const afterSale = await database
      .selectFrom('inventory_balance')
      .select('quantity')
      .where('stock_location_id', '=', routeStock.id)
      .where('product_id', '=', product.id)
      .executeTakeFirstOrThrow();
    expect(afterSale.quantity).toBe('1.000');

    const cancellation = new CancellationService(database);
    await cancellation.cancel(sale.id, 'Customer requested cancellation', {
      actorId: admin.id,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    });
    await expect(
      cancellation.cancel(sale.id, 'Duplicate cancellation', {
        actorId: admin.id,
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'SALE_ALREADY_CANCELLED' });
    const afterCancellation = await database
      .selectFrom('inventory_balance')
      .select('quantity')
      .where('stock_location_id', '=', routeStock.id)
      .where('product_id', '=', product.id)
      .executeTakeFirstOrThrow();
    expect(afterCancellation.quantity).toBe('2.000');
  });

  it('loads, returns, reconciles, and closes a route with zero temporary stock', async () => {
    const admin = await database
      .selectFrom('app_user')
      .select('id')
      .where('username', '=', 'admin')
      .executeTakeFirstOrThrow();
    const driver = await database
      .selectFrom('app_user')
      .select('id')
      .where('username', '=', 'driver')
      .executeTakeFirstOrThrow();
    const branch = await database
      .selectFrom('location')
      .select('id')
      .where('code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    const category = await database
      .insertInto('category')
      .values({ name: `Route ${crypto.randomUUID()}`, reporting_group: 'OTHER', archived_at: null })
      .returning('id')
      .executeTakeFirstOrThrow();
    const unit = await database
      .insertInto('unit')
      .values({
        code: `R-${crypto.randomUUID()}`,
        name: 'Route unit',
        quantity_scale: 0,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const product = await database
      .insertInto('product')
      .values({
        sku: `R-${crypto.randomUUID()}`,
        name: 'Route product',
        description: null,
        category_id: category.id,
        unit_id: unit.id,
        standard_unit_price: '12.0000',
        low_stock_threshold: '1.000',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const vehicle = await database
      .insertInto('vehicle')
      .values({
        code: `R-${crypto.randomUUID()}`,
        name: 'Route vehicle',
        registration: null,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const inventory = new InventoryService(database);
    await inventory.createBranchOperation(
      {
        operationType: 'ENTRY',
        branchId: branch.id,
        reason: 'Route lifecycle fixture',
        lines: [{ productId: product.id, quantity: '10' }],
      },
      {
        actorId: admin.id,
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      },
    );

    const loads = new RouteLoadService(database);
    const route = await loads.create(
      {
        routeNumber: `R-${crypto.randomUUID()}`,
        originLocationId: branch.id,
        driverId: driver.id,
        vehicleId: vehicle.id,
        businessDate: '2026-08-27',
      },
      { actorId: admin.id, requestId: crypto.randomUUID() },
    );
    const draft = await loads.saveDraft(
      route.id,
      route.version,
      [{ productId: product.id, quantity: '5' }],
      {
        actorId: driver.id,
        requestId: crypto.randomUUID(),
      },
    );
    const confirmationKey = crypto.randomUUID();
    const confirmed = await loads.confirm(route.id, draft.version, {
      actorId: driver.id,
      idempotencyKey: confirmationKey,
      requestId: crypto.randomUUID(),
    });
    const confirmationReplay = await loads.confirm(route.id, draft.version, {
      actorId: driver.id,
      idempotencyKey: confirmationKey,
      requestId: crypto.randomUUID(),
    });
    expect(confirmationReplay.id).toBe(confirmed.id);

    const transitions = new RouteTransitionService(database);
    const started = await transitions.transition(route.id, 'START', route.version, {
      actorId: driver.id,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    });
    const returned = await transitions.transition(route.id, 'RETURN', started.version, {
      actorId: driver.id,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    });
    const reconciliations = new RouteReconciliationService(database);
    const approved = await reconciliations.approve(
      route.id,
      {
        expectedVersion: returned.version,
        lines: [
          {
            productId: product.id,
            physicalReturnQuantity: '4',
            differenceReason: 'One unit damaged in transit',
          },
        ],
      },
      {
        actorId: admin.id,
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      },
    );
    expect(approved.state).toBe('APPROVED');
    const closed = await reconciliations.close(route.id, returned.version, {
      actorId: admin.id,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    });
    expect(closed.state).toBe('CLOSED');

    const routeBalance = await database
      .selectFrom('inventory_balance')
      .innerJoin('stock_location', 'stock_location.id', 'inventory_balance.stock_location_id')
      .select('inventory_balance.quantity')
      .where('stock_location.route_id', '=', route.id)
      .where('inventory_balance.product_id', '=', product.id)
      .executeTakeFirstOrThrow();
    expect(routeBalance.quantity).toBe('0.000');
    const reconciliationLine = await database
      .selectFrom('route_reconciliation_line')
      .select([
        'loaded_quantity',
        'sold_quantity',
        'physical_return_quantity',
        'difference_quantity',
      ])
      .where('route_reconciliation_id', '=', approved.id)
      .executeTakeFirstOrThrow();
    expect(reconciliationLine).toMatchObject({
      loaded_quantity: '5.000',
      sold_quantity: '0.000',
      physical_return_quantity: '4.000',
      difference_quantity: '1.000',
    });
    await expect(
      transitions.transition(route.id, 'RETURN', closed.version, {
        actorId: driver.id,
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ROUTE_TRANSITION' });
    const routeAudits = await database
      .selectFrom('audit_event')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('entity_id', '=', route.id)
      .executeTakeFirstOrThrow();
    expect(Number(routeAudits.count)).toBeGreaterThanOrEqual(4);
    const otherDriver = await database
      .insertInto('app_user')
      .values({
        username: `other-driver-${crypto.randomUUID()}`,
        display_name: 'Other route driver',
        password_hash: 'not-used-by-this-integration-test',
        role: 'DRIVER',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const otherDriverRoutes = await database.transaction().execute((transaction) =>
      new RouteRepository(transaction).list({
        id: otherDriver.id,
        role: 'DRIVER',
      }),
    );
    expect(otherDriverRoutes.some((candidate) => candidate.id === route.id)).toBe(false);
    await expect(
      database.transaction().execute((transaction) =>
        new RouteRepository(transaction).detail(route.id, {
          id: otherDriver.id,
          role: 'DRIVER',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ROUTE_FORBIDDEN' });
  });
});

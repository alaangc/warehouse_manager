import { afterAll, beforeAll, expect, it } from 'vitest';
import { administrationHarness, type TestPrincipal } from '../../support/administration-harness.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { CancellationService } from '../../../src/modules/sales/cancellation-service.js';

let harness: Awaited<ReturnType<typeof administrationHarness>>;
let admin: TestPrincipal;
beforeAll(async () => {
  harness = await administrationHarness();
  admin = await harness.login('admin');
});
afterAll(async () => {
  await harness?.close();
});

it('returns explicit zero aggregates for an empty operation and no financial fields to Drivers', async () => {
  const response = await harness.send(admin, 'get', '/overview');
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ grossTotal: '0.00', lowStockCount: 0, routes: [] });
  const driver = await harness.login('driver');
  expect((await harness.send(driver, 'get', '/overview')).body.data).toEqual({
    routes: [],
    actions: ['/sales/new', '/routes', '/sales', '/settings'],
  });
});

it('sums exact committed sales, excludes cancellations and counts active branch-product alerts including absent balances', async () => {
  const first = await createSaleScenario(harness.database, { standardUnitPrice: '0.1000' });
  const second = await createSaleScenario(harness.database, { standardUnitPrice: '0.2000' });
  const context = (actorId: string) => ({
    actorId,
    idempotencyKey: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
  });
  const sales = new SaleService(harness.database);
  await sales.confirm(
    saleCommand({
      customerId: first.customer.id,
      routeId: first.route.id,
      productId: first.product.id,
    }),
    context(first.driver.id),
  );
  const cancelled = await sales.confirm(
    saleCommand({
      customerId: second.customer.id,
      routeId: second.route.id,
      productId: second.product.id,
    }),
    context(second.driver.id),
  );
  expect((await harness.send(admin, 'get', '/overview')).body.data.grossTotal).toBe('0.30');
  await new CancellationService(harness.database).cancel(
    cancelled.id,
    'Overview cancellation test',
    context(admin.id),
  );
  // Two products at two active branches, including absent balances. Route stock is not an alert.
  expect((await harness.send(admin, 'get', '/overview')).body.data).toMatchObject({
    grossTotal: '0.10',
    lowStockCount: 4,
  });
  await harness.database
    .insertInto('inventory_balance')
    .values({
      stock_location_id: first.origin.stockLocationId,
      product_id: first.product.id,
      quantity: '1.000',
    })
    .execute();
  expect((await harness.send(admin, 'get', '/overview')).body.data.lowStockCount).toBe(4);
  await harness.database
    .updateTable('inventory_balance')
    .set({ quantity: '1.001' })
    .where('stock_location_id', '=', first.origin.stockLocationId)
    .where('product_id', '=', first.product.id)
    .execute();
  expect((await harness.send(admin, 'get', '/overview')).body.data.lowStockCount).toBe(3);
  await harness.database
    .updateTable('product')
    .set({ active: false, archived_at: new Date() })
    .where('id', '=', second.product.id)
    .execute();
  expect((await harness.send(admin, 'get', '/overview')).body.data.lowStockCount).toBe(1);
  await harness.database
    .updateTable('location')
    .set({ active: false, archived_at: new Date() })
    .where('code', '=', 'CABORCA')
    .execute();
  expect((await harness.send(admin, 'get', '/overview')).body.data.lowStockCount).toBe(0);

  const username = await harness.database
    .selectFrom('app_user')
    .select('username')
    .where('id', '=', first.driver.id)
    .executeTakeFirstOrThrow();
  const driver = await harness.login(username.username);
  const limited = (await harness.send(driver, 'get', '/overview')).body.data;
  expect(limited.routes).toEqual([
    { id: first.route.id, driverId: first.driver.id, state: 'EN_ROUTE' },
  ]);
  expect(limited).not.toHaveProperty('grossTotal');
  expect(limited).not.toHaveProperty('lowStockCount');
  // Closed routes are historical, not operational work.
  await harness.database
    .updateTable('route')
    .set({ state: 'CLOSED', closed_at: new Date(), closed_by: admin.id })
    .where('id', '=', first.route.id)
    .execute();
  expect((await harness.send(driver, 'get', '/overview')).body.data.routes).toEqual([]);
  expect((await harness.send(admin, 'get', '/overview')).body.data.routes).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: first.route.id })]),
  );
});

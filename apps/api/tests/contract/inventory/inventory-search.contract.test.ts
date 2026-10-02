import { sql } from 'kysely';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { administrationHarness } from '../../support/administration-harness.js';
import { createSaleScenario } from '../../support/sales-factories.js';

let h: Awaited<ReturnType<typeof administrationHarness>>;
let scenario: Awaited<ReturnType<typeof createSaleScenario>>;
beforeAll(async () => {
  h = await administrationHarness();
  scenario = await createSaleScenario(h.database);
  await sql`insert into product (sku,name,category_id,unit_id,standard_unit_price,low_stock_threshold)
    select 'SEARCH-' || n, 'Search product ' || n, ${scenario.category.id}::uuid, ${scenario.unit.id}::uuid,10,1
    from generate_series(1,101) n`.execute(h.database);
  await sql`insert into inventory_balance (product_id,stock_location_id,quantity,updated_at)
    select id,${scenario.origin.stockLocationId}::uuid,100,
      case when sku='SEARCH-101' then '2020-01-01'::timestamptz else now() end
    from product where sku like 'SEARCH-%'`.execute(h.database);
}, 120_000);
afterAll(async () => {
  await h?.close();
});
it('searches before the 100-row limit and preserves Driver scope', async () => {
  const admin = await h.login('admin');
  const found = await h.send(admin, 'get', '/inventory/balances?search=Search%20product%20101');
  expect(found.status).toBe(200);
  expect(found.body.data).toHaveLength(1);
  expect(found.body.data[0]).toMatchObject({
    productName: 'Search product 101',
    quantity: '100.000',
  });
  expect((await h.send(admin, 'get', '/inventory/balances?search=not-present')).body.data).toEqual(
    [],
  );
  const driver = await h.login('driver');
  expect((await h.send(driver, 'get', '/inventory/balances?search=Search')).body.data).toEqual([]);
  for (const search of ['x'.repeat(161), 'a&search=b']) {
    expect((await h.send(admin, 'get', `/inventory/balances?search=${search}`)).status).toBe(422);
  }
});

import type { Server } from 'node:http';
import { sql } from 'kysely';
import { test as base, expect } from '@playwright/test';
import {
  administrationHarness,
  testPrinterProfile,
} from '../../../apps/api/tests/support/administration-harness.js';
import {
  createSaleScenario,
  saleCommand,
} from '../../../apps/api/tests/support/sales-factories.js';

// BILINGUAL-FIXTURE-1: real HTTP API and disposable PostgreSQL, no response stubs.
async function fixture() {
  const h = await administrationHarness();
  let server: Server | undefined;
  try {
    const admin = await h.login('admin');
    const scenario = await createSaleScenario(h.database, {
      stockQuantity: '1234.500',
      standardUnitPrice: '1234.5600',
    });
    await h.database
      .updateTable('customer')
      .set({ display_name: 'Abarrotes Muñoz', notes: 'Entrega detrás del árbol' })
      .where('id', '=', scenario.customer.id)
      .execute();
    await h.database
      .updateTable('product')
      .set({ name: 'Carbón El Sol', description: 'Bolsa histórica sin traducir' })
      .where('id', '=', scenario.product.id)
      .execute();
    async function actorFor(id: string) {
      const row = await h.database
        .selectFrom('app_user')
        .select('username')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      return h.login(row.username);
    }
    const driver = await actorFor(scenario.driver.id);
    const post = (actor: typeof admin, path: string, body: object) =>
      h.send(actor, 'post', path, body).set('Idempotency-Key', crypto.randomUUID());
    const sale = await post(
      driver,
      '/sales',
      saleCommand({
        customerId: scenario.customer.id,
        routeId: scenario.route.id,
        productId: scenario.product.id,
      }),
    );
    expect(sale.status).toBe(201);
    const preparing = await createSaleScenario(h.database);
    await h.database
      .updateTable('route')
      .set({ state: 'PREPARING', started_at: null })
      .where('id', '=', preparing.route.id)
      .execute();
    const preparingDriver = await actorFor(preparing.driver.id);
    const returned = await createSaleScenario(h.database, { stockQuantity: '0.000' });
    const returnedDriver = await actorFor(returned.driver.id);
    await h.database
      .updateTable('route')
      .set({ state: 'PREPARING', started_at: null })
      .where('id', '=', returned.route.id)
      .execute();
    await h.database
      .insertInto('inventory_balance')
      .values({
        stock_location_id: returned.origin.stockLocationId,
        product_id: returned.product.id,
        quantity: '5.000',
      })
      .execute();
    const load = await h.send(returnedDriver, 'put', `/routes/${returned.route.id}/load`, {
      expectedVersion: 1,
      lines: [{ productId: returned.product.id, quantity: '5.000' }],
    });
    expect(load.status).toBe(200);
    expect(
      (
        await post(returnedDriver, `/routes/${returned.route.id}/load/confirmation`, {
          expectedVersion: load.body.data.version,
        })
      ).status,
    ).toBe(200);
    const started = await post(returnedDriver, `/routes/${returned.route.id}/start`, {
      expectedVersion: returned.route.version,
    });
    expect(started.status).toBe(200);
    expect(
      (
        await post(returnedDriver, `/routes/${returned.route.id}/return`, {
          expectedVersion: started.body.data.version,
        })
      ).status,
    ).toBe(200);
    const profile = await post(admin, '/printer-profiles', testPrinterProfile);
    expect(profile.status).toBe(201);
    const close = await post(admin, '/cash-closes', {
      periodKind: 'DAY',
      anchorDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo' }).format(
        new Date(),
      ),
    });
    expect(close.status).toBe(201);
    const document = await post(admin, '/documents', {
      documentType: 'TICKET',
      sourceType: 'SALE',
      sourceId: sale.body.data.id,
    });
    expect(document.status).toBe(202);
    await expect
      .poll(
        async () =>
          (await h.send(admin, 'get', `/documents/${document.body.data.id}`)).body.data.state,
      )
      .toBe('READY');
    const attempt = await post(driver, '/output-attempts', {
      documentId: document.body.data.id,
      mode: 'DOWNLOAD',
      state: 'SUCCEEDED',
    });
    expect(attempt.status).toBe(201);
    await new Promise<void>((resolve) => {
      server = h.app.listen(0, '127.0.0.1', resolve);
    });
    const address = server!.address();
    if (!address || typeof address === 'string') throw Error('Missing bilingual fixture port');
    return {
      ...h,
      admin,
      driver,
      preparingDriver,
      scenario,
      preparing,
      returned,
      sale: sale.body.data,
      closeRow: close.body.data,
      document: document.body.data,
      apiOrigin: `http://127.0.0.1:${address.port}`,
      async snapshot() {
        // Excludes authentication sessions; language changes must not mutate business/audit rows.
        const tables = [
          'customer',
          'customer_price',
          'product',
          'category',
          'unit',
          'location',
          'vehicle',
          'business_setting',
          'printer_profile',
          'route',
          'inventory_balance',
          'inventory_movement',
          'sale',
          'sale_line',
          'sale_ticket',
          'cash_close',
          'document_output',
          'output_attempt',
          'audit_event',
        ];
        const result: Record<string, unknown> = {};
        for (const table of tables) {
          const rows =
            await sql`select to_jsonb(r) as row from ${sql.table(table)} r order by r.id`.execute(
              h.database,
            );
          result[table] = rows.rows;
        }
        return result;
      },
      async stop() {
        server?.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        await h.close();
      },
    };
  } catch (error) {
    server?.closeAllConnections();
    server?.close();
    await h.close();
    throw error;
  }
}

export const test = base.extend<
  Record<never, never>,
  { warehouse: Awaited<ReturnType<typeof fixture>> }
>({
  warehouse: [
    async ({ browserName }, use) => {
      void browserName;
      const warehouse = await fixture();
      try {
        await use(warehouse);
      } finally {
        await warehouse.stop();
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  page: async ({ page, warehouse }, use) => {
    const context = page.context();
    await context.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: `${warehouse.apiOrigin}${url.pathname}${url.search}`,
        headers: { ...route.request().headers(), origin: 'https://warehouse.test' },
      });
      try {
        await route.fulfill({ response });
      } catch (error) {
        // A reload can cancel an old page's fetch while its API response is in flight.
        if (!route.request().failure()) throw error;
      }
    });
    try {
      await use(page);
    } finally {
      // Let forwarded requests finish before Playwright disposes their response bodies.
      await context.unrouteAll({ behavior: 'wait' });
    }
  },
});
export { expect };
export type Warehouse = Awaited<ReturnType<typeof fixture>>;

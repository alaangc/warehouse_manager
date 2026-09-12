import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import {
  administrationHarness,
  testPrinterProfile,
} from '../../../apps/api/tests/support/administration-harness.js';
import {
  createSaleScenario,
  saleCommand,
} from '../../../apps/api/tests/support/sales-factories.js';

type Source = { documentType: string; sourceType: string; sourceId: string };
export type DocumentRow = Source & { id: string; state: string; createdBy: string };
async function fixture() {
  const storage = await mkdtemp(join(tmpdir(), 'warehouse-document-e2e-'));
  const h = await administrationHarness({ documentStoragePath: storage }).catch(
    async (error: unknown) => {
      await rm(storage, { recursive: true, force: true });
      throw error;
    },
  );
  let server: Server | undefined;
  try {
    const admin = await h.login('admin');
    const post = (actor: typeof admin, path: string, body: object) =>
      h.send(actor, 'post', path, body).set('Idempotency-Key', crypto.randomUUID());
    const profile = await post(admin, '/printer-profiles', testPrinterProfile);
    expect(profile.status).toBe(201);
    async function scenario(confirm = true) {
      const s = await createSaleScenario(h.database, { stockQuantity: '1000.000' });
      const { username } = await h.database
        .selectFrom('app_user')
        .select('username')
        .where('id', '=', s.driver.id)
        .executeTakeFirstOrThrow();
      const actor = await h.login(username);
      await h.database
        .updateTable('route')
        .set({ state: 'PREPARING', started_at: null })
        .where('id', '=', s.route.id)
        .execute();
      const draft = await h.send(actor, 'put', `/routes/${s.route.id}/load`, {
        expectedVersion: 1,
        lines: [{ productId: s.product.id, quantity: '1.000' }],
      });
      expect(draft.status).toBe(200);
      if (confirm) {
        await h.database
          .insertInto('inventory_balance')
          .values({
            stock_location_id: s.origin.stockLocationId,
            product_id: s.product.id,
            quantity: '100.000',
          })
          .execute();
        expect(
          (
            await post(actor, `/routes/${s.route.id}/load/confirmation`, {
              expectedVersion: draft.body.data.version,
            })
          ).status,
        ).toBe(200);
        expect(
          (await post(actor, `/routes/${s.route.id}/start`, { expectedVersion: 1 })).status,
        ).toBe(200);
      }
      const load: Source = {
        documentType: 'ROUTE_LOAD',
        sourceType: 'ROUTE_LOAD',
        sourceId: draft.body.data.id,
      };
      const sale = async (): Promise<Source> => {
        const response = await post(
          actor,
          '/sales',
          saleCommand({ customerId: s.customer.id, routeId: s.route.id, productId: s.product.id }),
        );
        expect(response.status).toBe(201);
        return { documentType: 'TICKET', sourceType: 'SALE', sourceId: response.body.data.id };
      };
      return { actor, username, load, sale };
    }
    const own = await scenario(),
      other = await scenario(),
      draft = await scenario(false);
    const ticket = await own.sale(),
      foreignTicket = await other.sale();
    const period = { periodKind: 'DAY', anchorDate: '2026-09-11' };
    const cash = await post(admin, '/cash-closes', period);
    expect(cash.status).toBe(201);
    const report = await post(admin, '/report-snapshots', {
      reportType: 'FINANCIAL_SUMMARY',
      filters: period,
    });
    expect(report.status).toBe(201);
    const sources: Source[] = [
      ticket,
      own.load,
      { documentType: 'CASH_CLOSE', sourceType: 'CASH_CLOSE', sourceId: cash.body.data.id },
      { documentType: 'REPORT', sourceType: 'REPORT_SNAPSHOT', sourceId: report.body.data.id },
    ];
    await new Promise<void>((resolve) => {
      server = h.app.listen(0, '127.0.0.1', resolve);
    });
    const address = server!.address();
    if (!address || typeof address === 'string') throw Error('Missing API port');
    const apiOrigin = `http://127.0.0.1:${address.port}`;
    async function create(source: Source, actor = admin): Promise<DocumentRow> {
      const response = await post(actor, '/documents', source);
      expect(response.status).toBe(202);
      const doc = response.body.data as DocumentRow;
      await expect
        .poll(async () => (await h.send(actor, 'get', `/documents/${doc.id}`)).body.data?.state)
        .toBe('READY');
      return doc;
    }
    return {
      ...h,
      storage,
      apiOrigin,
      admin,
      own,
      other,
      draft,
      sources,
      ticket,
      foreignTicket,
      printerId: profile.body.data.id as string,
      post,
      create,
      close: async () => {
        server?.closeAllConnections();
        if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
        try {
          await h.close();
        } finally {
          await rm(storage, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    server?.closeAllConnections();
    server?.close();
    await h.close();
    await rm(storage, { recursive: true, force: true });
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
      const h = await fixture();
      try {
        await use(h);
      } finally {
        await h.close();
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
});
test.beforeEach(async ({ context, warehouse }) => {
  await context.addInitScript(() => localStorage.setItem('warehouse-manager-language', 'en'));
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${warehouse.apiOrigin}${url.pathname}${url.search}`,
      headers: { ...route.request().headers(), origin: 'https://warehouse.test' },
    });
    await route.fulfill({ response });
  });
});
export { expect };
export async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.locator('input[name="password"]').fill('development-password-change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/login/);
}
export async function api(page: Page, path: string, body?: object) {
  return page.evaluate(
    async ({ path, body }) => {
      const session = await fetch('/api/v1/auth/session');
      const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': session.headers.get('x-csrf-token') ?? '',
        'Idempotency-Key': crypto.randomUUID(),
      };
      const response = await fetch(`/api/v1${path}`, {
        method: body ? 'POST' : 'GET',
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
        text,
        body: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : null,
      };
    },
    { path, body },
  );
}

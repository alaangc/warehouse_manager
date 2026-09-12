import type { Server } from 'node:http';
import { test, expect } from '@playwright/test';
import {
  administrationHarness,
  testPrinterProfile,
} from '../../apps/api/tests/support/administration-harness.js';

// The browser uses the development web bundle, but every API call goes to a
// disposable PostgreSQL-backed server. Never mutate the developer's database.
let harness: Awaited<ReturnType<typeof administrationHarness>>;
let server: Server;
let apiOrigin: string;
test.beforeAll(async () => {
  harness = await administrationHarness();
  await new Promise<void>((resolve) => {
    server = harness.app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server has no TCP address');
  apiOrigin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await harness?.close();
});
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('warehouse-manager-language', 'en'));
  await context.route('**/api/v1/**', async (route) => {
    const original = new URL(route.request().url());
    const response = await route.fetch({
      url: `${apiOrigin}${original.pathname}${original.search}`,
      headers: { ...route.request().headers(), origin: 'https://warehouse.test' },
    });
    await route.fulfill({ response });
  });
});

test('creates a Driver, denies administrator access, revokes access, and retains actor history', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const password = 'development-password-change-me';
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Users', exact: true }).click();
  await page.getByRole('button', { name: 'New user' }).click();
  const username = `e2e-${crypto.randomUUID()}`;
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Display name').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Save user' }).click();
  await expect(page.getByRole('button', { name: `Edit ${username}` })).toBeVisible();
  const principal = await harness.login(username);
  expect((await harness.send(principal, 'get', '/users')).status).toBe(403);
  expect((await harness.send(principal, 'get', '/settings/business')).status).toBe(403);
  const customer = await harness.send(principal, 'post', '/customers', {
    displayName: `Customer ${username}`,
  });
  expect(customer.status).toBe(403);
  const admin = await harness.login('admin');
  const profile = await harness.send(admin, 'post', '/printer-profiles', testPrinterProfile);
  expect(profile.status).toBe(201);
  expect(
    (
      await harness.send(principal, 'put', '/me/printer-preference', {
        printerProfileId: profile.body.data.id,
      })
    ).status,
  ).toBe(200);
  const history = await harness.database
    .selectFrom('audit_event')
    .selectAll()
    .where('actor_id', '=', principal.id)
    .execute();
  expect(history.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: `Edit ${username}` }).click();
  await page.getByRole('combobox', { name: 'Status', exact: true }).last().click();
  await page.getByRole('option', { name: 'Inactive', exact: true }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Account retired');
  await page.getByRole('button', { name: 'Save user' }).click();
  await expect(page.getByRole('alert')).toHaveText(/saved/i);
  expect((await harness.send(principal, 'get', '/auth/session')).status).toBe(401);
  expect(
    await harness.database
      .selectFrom('audit_event')
      .selectAll()
      .where('actor_id', '=', principal.id)
      .execute(),
  ).toEqual(history);
  await context.clearCookies();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/login/);
});

test('Driver connects and tests only an approved printer without gaining configuration access', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const admin = await harness.login('admin');
  const profile = await harness.send(admin, 'post', '/printer-profiles', testPrinterProfile);
  expect(profile.status).toBe(201);
  // Simulates the BLE transport, not the API authorization or durable attempt log.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: async () => ({
          name: 'E2E printer',
          addEventListener() {},
          removeEventListener() {},
          gatt: {
            connected: true,
            disconnect() {},
            connect: async () => ({
              getPrimaryService: async () => ({
                getCharacteristic: async () => ({
                  writeValueWithResponse: async () => {},
                  writeValueWithoutResponse: async () => {},
                }),
              }),
            }),
          },
        }),
      },
    });
  });
  await page.goto('/login');
  await page.getByLabel('Username').fill('driver');
  await page.locator('input[name="password"]').fill('development-password-change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('region', { name: 'Operational totals' })).toBeVisible();
  await expect(page.getByText('Completed sales total (all dates)')).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Business timezone')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New printer' })).toHaveCount(0);
  await page.getByLabel('Printer', { exact: true }).selectOption(profile.body.data.id);
  await page.getByRole('button', { name: 'Connect printer', exact: true }).click();
  const attempt = page.waitForResponse(
    (response) =>
      response.url().includes('/output-attempts') &&
      response.request().postDataJSON()?.state === 'SUCCEEDED',
  );
  await page.getByRole('button', { name: 'Test printer' }).click();
  expect((await attempt).status()).toBe(201);
  await expect(page.getByTestId('printer-test-result')).toHaveAttribute('data-state', 'SUCCEEDED');
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('printer-desktop.png'), fullPage: true });
  await page.reload();
  await expect(page.getByLabel('Printer', { exact: true })).toHaveValue(profile.body.data.id);
  await expect(page.getByTestId('printer-test-result')).toHaveAttribute('data-state', 'SUCCEEDED');
  await expect(page.getByRole('button', { name: 'Test printer', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('printer-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const driver = await harness.login('driver');
  const records = await harness.database
    .selectFrom('output_attempt')
    .selectAll()
    .where('actor_id', '=', driver.id)
    .where('printer_profile_id', '=', profile.body.data.id)
    .orderBy('attempt_number')
    .execute();
  expect(records.map((row) => row.state)).toEqual(['STARTED', 'SUCCEEDED']);
  expect(records.every((row) => row.document_output_id === null)).toBe(true);
  expect(
    (await harness.send(driver, 'get', '/me/printer-preference')).body.data.lastTestResult,
  ).toBe('SUCCEEDED');
  expect(pageErrors).toEqual([]);
});

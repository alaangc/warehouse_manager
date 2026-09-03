import type { Page, Response } from '@playwright/test';
import { expect, test } from './support/test-fixtures.js';

const password = 'development-password-change-me';
const magdalenaBranchId = '00000000-0000-4000-8000-000000000020';
const driversByProject: Record<string, { id: string; username: string }> = {
  chromium: { id: '00000000-0000-4000-8000-000000000011', username: 'driver' },
  firefox: { id: '00000000-0000-4000-8000-000000000012', username: 'driver-firefox' },
  webkit: { id: '00000000-0000-4000-8000-000000000013', username: 'driver-webkit' },
};

interface Resource {
  id: string;
  version: number;
}

interface SaleResult extends Resource {
  saleNumber: string;
  ticketNumber: string;
  currencyCode: string;
  total: string;
}

interface ApiEnvelope<T> {
  data: T;
}

async function login(page: Page, username: string): Promise<string> {
  await page.addInitScript(() => {
    window.localStorage.setItem('warehouse-manager-language', 'en');
  });
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.locator('input[name="password"]').fill(password);
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/auth/login' && response.request().method() === 'POST';
  });
  await page.getByRole('button', { name: 'Sign in' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /Hello,/ })).toBeVisible();
  const csrfToken = response.headers()['x-csrf-token'];
  expect(csrfToken).toBeTruthy();
  return csrfToken!;
}

async function apiMutation<T>(
  page: Page,
  csrfToken: string,
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  expectedStatus: 200 | 201,
  idempotencyKey?: string,
): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    data: body,
    headers: {
      Origin: new URL(page.url()).origin,
      'X-CSRF-Token': csrfToken,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  });
  if (response.status() !== expectedStatus) {
    throw new Error(`${method} ${path} returned ${response.status()}: ${await response.text()}`);
  }
  return ((await response.json()) as ApiEnvelope<T>).data;
}

function newIdempotencyKey(label: string): string {
  return `e2e-${label}-${crypto.randomUUID()}`;
}

function matchingResponse(page: Page, path: string, method = 'POST'): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/v1${path}` && response.request().method() === method;
  });
}

test('sale ticket retry, cancellation, and Driver history remain scoped', async ({
  administratorPage,
  driverPage,
}, testInfo) => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to run against the isolated full stack.');

  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`
    .replace(/[^a-z0-9]/gi, '')
    .slice(-20);
  const productName = `E2E sale product ${suffix}`;
  const customerName = `E2E sale customer ${suffix}`;
  const routeNumber = `E2E-SALE-${suffix}`;
  const assignedDriver = driversByProject[testInfo.project.name] ?? driversByProject.chromium!;
  const anotherDriver = Object.values(driversByProject).find(
    (candidate) => candidate.id !== assignedDriver.id,
  )!;

  const administratorCsrf = await login(administratorPage, 'admin');
  const unit = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/units',
    { code: `US${suffix}`, name: `Sale unit ${suffix}`, quantityScale: 0 },
    201,
  );
  const category = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/categories',
    { name: `Sale category ${suffix}`, reportingGroup: 'OTHER' },
    201,
  );
  const vehicle = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/vehicles',
    { code: `VS${suffix}`, name: `Sale vehicle ${suffix}`, registration: `REG-${suffix}` },
    201,
  );
  const product = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/products',
    {
      sku: `SALE-${suffix}`,
      name: productName,
      categoryId: category.id,
      unitId: unit.id,
      standardUnitPrice: '25.50',
      lowStockThreshold: '1',
      description: 'End-to-end sale product',
    },
    201,
  );
  await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/customers',
    {
      displayName: customerName,
      city: 'Magdalena',
      contactName: null,
      phone: null,
      email: null,
      address: null,
      notes: 'End-to-end sale customer',
    },
    201,
  );
  await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/inventory/operations',
    {
      operationType: 'ENTRY',
      branchId: magdalenaBranchId,
      reason: `Sale test stock ${suffix}`,
      lines: [{ productId: product.id, quantity: '5' }],
    },
    201,
    newIdempotencyKey('stock'),
  );
  const route = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/routes',
    {
      routeNumber,
      originLocationId: magdalenaBranchId,
      driverId: assignedDriver.id,
      vehicleId: vehicle.id,
      businessDate: new Date().toISOString().slice(0, 10),
    },
    201,
  );

  const driverCsrf = await login(driverPage, assignedDriver.username);
  const load = await apiMutation<Resource>(
    driverPage,
    driverCsrf,
    'PUT',
    `/routes/${route.id}/load`,
    { expectedVersion: route.version, lines: [{ productId: product.id, quantity: '5' }] },
    200,
  );
  const confirmedRoute = await apiMutation<{ route: Resource; load: Resource }>(
    driverPage,
    driverCsrf,
    'POST',
    `/routes/${route.id}/load/confirmation`,
    { expectedVersion: load.version },
    200,
    newIdempotencyKey('confirm-load'),
  );
  const activeRoute = await apiMutation<Resource>(
    driverPage,
    driverCsrf,
    'POST',
    `/routes/${route.id}/start`,
    { expectedVersion: confirmedRoute.route.version },
    200,
    newIdempotencyKey('start-route'),
  );

  const submittedRequests: Array<{ clientOperationId: string; idempotencyKey: string }> = [];
  let committedSale: SaleResult | undefined;
  await driverPage.route('**/api/v1/sales', async (routeIntercept) => {
    const request = routeIntercept.request();
    const url = new URL(request.url());
    if (url.pathname !== '/api/v1/sales' || request.method() !== 'POST') {
      await routeIntercept.continue();
      return;
    }
    const body = request.postDataJSON() as { clientOperationId: string };
    submittedRequests.push({
      clientOperationId: body.clientOperationId,
      idempotencyKey: request.headers()['idempotency-key'] ?? '',
    });
    if (!committedSale) {
      const response = await routeIntercept.fetch();
      expect(response.status()).toBe(201);
      committedSale = ((await response.json()) as ApiEnvelope<SaleResult>).data;
      await routeIntercept.abort('connectionfailed');
      return;
    }
    await routeIntercept.continue();
  });

  await driverPage.goto('/sales/new');
  await expect(driverPage.getByRole('combobox', { name: 'Active route' })).toHaveText(routeNumber);
  await driverPage.getByRole('combobox', { name: 'Customer' }).click();
  await driverPage.getByRole('option', { name: new RegExp(customerName) }).click();
  await driverPage.getByRole('button', { name: 'Next: products' }).click();
  await driverPage.getByRole('combobox', { name: 'Product' }).click();
  await driverPage.getByRole('option', { name: productName, exact: true }).click();
  await driverPage.getByLabel('Quantity').fill('2');
  await driverPage.getByRole('button', { name: 'Review authoritative quote' }).click();
  await expect(driverPage.getByText('MXN 51.00').last()).toBeVisible();

  await driverPage.getByRole('button', { name: 'Confirm sale' }).click();
  await expect(driverPage.getByRole('alert')).toContainText(/try again/i);
  await expect.poll(() => committedSale?.ticketNumber).toBeTruthy();

  const replayResponsePromise = matchingResponse(driverPage, '/sales');
  await driverPage.getByRole('button', { name: 'Confirm sale' }).click();
  const replayResponse = await replayResponsePromise;
  expect(replayResponse.status()).toBe(201);
  const replayedSale = ((await replayResponse.json()) as ApiEnvelope<SaleResult>).data;
  expect(replayedSale.id).toBe(committedSale!.id);
  expect(replayedSale.ticketNumber).toBe(committedSale!.ticketNumber);
  expect(submittedRequests).toHaveLength(2);
  expect(submittedRequests[1]).toEqual(submittedRequests[0]);
  await expect(driverPage.getByRole('heading', { name: 'Sale ticket' })).toBeVisible();
  await expect(driverPage.getByText(committedSale!.ticketNumber)).toBeVisible();

  await driverPage.goto('/sales');
  const ownSaleRow = driverPage.getByRole('row').filter({ hasText: committedSale!.saleNumber });
  await expect(ownSaleRow).toHaveCount(1);
  await expect(ownSaleRow).toContainText('Completed');

  const cancellation = await apiMutation<{ id: string; status: string }>(
    administratorPage,
    administratorCsrf,
    'POST',
    `/sales/${committedSale!.id}/cancellation`,
    { reason: `E2E cancellation ${suffix}` },
    200,
    newIdempotencyKey('cancel-sale'),
  );
  expect(cancellation.status).toBe('CANCELLED');

  await driverPage.reload();
  await expect(ownSaleRow).toContainText('Cancelled');
  const ownDetail = await driverPage.request.get(`/api/v1/sales/${committedSale!.id}`);
  expect(ownDetail.status()).toBe(200);
  const forbiddenHistory = await driverPage.request.get(
    `/api/v1/sales?driverId=${anotherDriver.id}`,
  );
  expect(forbiddenHistory.status()).toBe(403);
  expect((await forbiddenHistory.json()).code).toBe('SALE_HISTORY_FORBIDDEN');

  const returnedRoute = await apiMutation<Resource>(
    driverPage,
    driverCsrf,
    'POST',
    `/routes/${route.id}/return`,
    { expectedVersion: activeRoute.version },
    200,
    newIdempotencyKey('return-route'),
  );
  await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'PUT',
    `/routes/${route.id}/reconciliation`,
    {
      expectedVersion: returnedRoute.version,
      lines: [{ productId: product.id, physicalReturnQuantity: '5' }],
    },
    200,
    newIdempotencyKey('reconcile-route'),
  );
  await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    `/routes/${route.id}/close`,
    { expectedVersion: returnedRoute.version },
    200,
    newIdempotencyKey('close-route'),
  );
});

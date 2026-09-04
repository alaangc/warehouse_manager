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

interface CustomerResource extends Resource {
  customerNumber: string;
  displayName: string;
  city: string;
  active: boolean;
}

interface SaleResource extends Resource {
  saleNumber: string;
  total: string;
}

interface RouteResource extends Resource {
  routeNumber: string;
  driverId: string;
  state: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';
}

interface RouteDetail {
  route: RouteResource;
  balances: Array<{ productId: string; quantity: string }>;
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
  const responsePromise = matchingResponse(page, '/auth/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /Hello,/ })).toBeVisible();
  const csrfToken = response.headers()['x-csrf-token'];
  expect(csrfToken).toBeTruthy();
  return csrfToken!;
}

function matchingResponse(page: Page, path: string, method = 'POST'): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/v1${path}` && response.request().method() === method;
  });
}

async function apiMutation<T>(
  page: Page,
  csrfToken: string,
  method: 'POST' | 'PUT' | 'PATCH',
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

async function apiGet<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1${path}`);
  if (!response.ok()) throw new Error(`GET ${path} returned ${response.status()}`);
  return ((await response.json()) as ApiEnvelope<T>).data;
}

async function closeReturnedRoute(
  administratorPage: Page,
  administratorCsrf: string,
  driverPage: Page,
  driverCsrf: string,
  route: RouteResource,
) {
  let returned = route;
  if (returned.state === 'EN_ROUTE') {
    returned = await apiMutation<RouteResource>(
      driverPage,
      driverCsrf,
      'POST',
      `/routes/${route.id}/return`,
      { expectedVersion: route.version },
      200,
      newIdempotencyKey('return-route'),
    );
  }
  if (returned.state !== 'RETURNED') {
    throw new Error(`Cannot clean up ${returned.routeNumber} from state ${returned.state}`);
  }
  const detail = await apiGet<RouteDetail>(administratorPage, `/routes/${returned.id}`);
  await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'PUT',
    `/routes/${returned.id}/reconciliation`,
    {
      expectedVersion: returned.version,
      lines: detail.balances.map((balance) => ({
        productId: balance.productId,
        physicalReturnQuantity: balance.quantity,
      })),
    },
    200,
    newIdempotencyKey('reconcile-route'),
  );
  await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    `/routes/${returned.id}/close`,
    { expectedVersion: returned.version },
    200,
    newIdempotencyKey('close-route'),
  );
}

function newIdempotencyKey(label: string): string {
  return `e2e-customer-${label}-${crypto.randomUUID()}`;
}

test('customer pricing falls back safely while history and role boundaries remain intact', async ({
  administratorPage,
  driverPage,
}, testInfo) => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to run against the isolated full stack.');

  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`
    .replace(/[^a-z0-9]/gi, '')
    .slice(-20);
  const customerName = `E2E customer ${suffix}`;
  const productName = `E2E priced product ${suffix}`;
  const routeNumber = `E2E-CUSTOMER-${suffix}`;
  const assignedDriver = driversByProject[testInfo.project.name] ?? driversByProject.chromium!;

  const administratorCsrf = await login(administratorPage, 'admin');
  const driverCsrf = await login(driverPage, assignedDriver.username);
  const existingRoutes = await apiGet<RouteResource[]>(administratorPage, '/routes');
  for (const existingRoute of existingRoutes.filter(
    (route) =>
      route.driverId === assignedDriver.id &&
      route.routeNumber.startsWith('E2E-CUSTOMER-') &&
      (route.state === 'EN_ROUTE' || route.state === 'RETURNED'),
  )) {
    await closeReturnedRoute(
      administratorPage,
      administratorCsrf,
      driverPage,
      driverCsrf,
      existingRoute,
    );
  }
  const unit = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/units',
    { code: `UC${suffix}`, name: `Customer unit ${suffix}`, quantityScale: 0 },
    201,
  );
  const category = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/categories',
    { name: `Customer category ${suffix}`, reportingGroup: 'OTHER' },
    201,
  );
  const vehicle = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/vehicles',
    {
      code: `VC${suffix}`,
      name: `Customer vehicle ${suffix}`,
      registration: `CUSTOMER-${suffix}`,
    },
    201,
  );
  const product = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/products',
    {
      sku: `PRICE-${suffix}`,
      name: productName,
      categoryId: category.id,
      unitId: unit.id,
      standardUnitPrice: '20.0000',
      lowStockThreshold: '1',
      description: 'End-to-end customer pricing fixture',
    },
    201,
  );

  await administratorPage.goto('/customers');
  await administratorPage.getByRole('button', { name: 'New customer' }).click();
  await administratorPage.getByLabel('Customer name').fill(customerName);
  await administratorPage.getByLabel('Contact name').fill(`Buyer ${suffix}`);
  await administratorPage.getByLabel('City').fill('Magdalena');
  await administratorPage.getByLabel('Notes').fill('Created by the US4 browser walkthrough');
  const customerResponsePromise = matchingResponse(administratorPage, '/customers');
  await administratorPage.getByRole('button', { name: 'Create customer' }).click();
  const customerResponse = await customerResponsePromise;
  expect(customerResponse.status()).toBe(201);
  const customer = ((await customerResponse.json()) as ApiEnvelope<CustomerResource>).data;
  await expect(administratorPage.getByRole('heading', { name: customerName })).toBeVisible();
  await expect(administratorPage.getByText(customer.customerNumber).first()).toBeVisible();

  await administratorPage.getByLabel('Product ID').fill(product.id);
  await administratorPage.getByLabel('Exact unit price').fill('17.2500');
  const priceResponsePromise = matchingResponse(
    administratorPage,
    `/customers/${customer.id}/prices`,
  );
  await administratorPage.getByRole('button', { name: 'Add price' }).click();
  const priceResponse = await priceResponsePromise;
  expect(priceResponse.status()).toBe(201);
  const price = ((await priceResponse.json()) as ApiEnvelope<Resource>).data;
  await expect(administratorPage.getByText(new RegExp(product.id))).toContainText('17.25');

  await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/inventory/operations',
    {
      operationType: 'ENTRY',
      branchId: magdalenaBranchId,
      reason: `Customer pricing stock ${suffix}`,
      lines: [{ productId: product.id, quantity: '10' }],
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

  const load = await apiMutation<Resource>(
    driverPage,
    driverCsrf,
    'PUT',
    `/routes/${route.id}/load`,
    { expectedVersion: route.version, lines: [{ productId: product.id, quantity: '10' }] },
    200,
  );
  const confirmed = await apiMutation<{ route: Resource }>(
    driverPage,
    driverCsrf,
    'POST',
    `/routes/${route.id}/load/confirmation`,
    { expectedVersion: load.version },
    200,
    newIdempotencyKey('confirm-load'),
  );
  const activeRoute = await apiMutation<RouteResource>(
    driverPage,
    driverCsrf,
    'POST',
    `/routes/${route.id}/start`,
    { expectedVersion: confirmed.route.version },
    200,
    newIdempotencyKey('start-route'),
  );

  const deniedPrice = await driverPage.request.post(`/api/v1/customers/${customer.id}/prices`, {
    data: {
      productId: product.id,
      unitPrice: '1.0000',
      validFrom: new Date().toISOString(),
    },
    headers: {
      Origin: new URL(driverPage.url()).origin,
      'X-CSRF-Token': driverCsrf,
    },
  });
  expect(deniedPrice.status()).toBe(403);
  expect((await deniedPrice.json()).code).toBe('ROLE_FORBIDDEN');

  await driverPage.goto('/customers');
  await driverPage.getByLabel('Search customers').fill(customerName);
  await driverPage.getByRole('button', { name: new RegExp(customer.customerNumber) }).click();
  await expect(driverPage.getByText(/access is read only/i)).toBeVisible();
  await expect(driverPage.getByRole('button', { name: 'New customer' })).toHaveCount(0);
  await expect(driverPage.getByRole('heading', { name: 'Special prices' })).toHaveCount(0);

  await driverPage.goto('/sales/new');
  await expect(driverPage.getByRole('combobox', { name: 'Active route' })).toHaveText(routeNumber);
  await driverPage.getByRole('combobox', { name: 'Customer' }).click();
  await driverPage.getByRole('option', { name: new RegExp(customerName) }).click();
  await driverPage.getByRole('button', { name: 'Next: products' }).click();
  await driverPage.getByRole('combobox', { name: 'Product' }).click();
  await driverPage.getByRole('option', { name: productName, exact: true }).click();
  await driverPage.getByLabel('Quantity').fill('1');
  await driverPage.getByRole('button', { name: 'Review authoritative quote' }).click();
  await expect(driverPage.getByText('Customer-specific price')).toBeVisible();
  await expect(driverPage.getByText('MXN 17.25').last()).toBeVisible();
  const saleResponsePromise = matchingResponse(driverPage, '/sales');
  await driverPage.getByRole('button', { name: 'Confirm sale' }).click();
  const saleResponse = await saleResponsePromise;
  expect(saleResponse.status()).toBe(201);
  const sale = ((await saleResponse.json()) as ApiEnvelope<SaleResource>).data;
  expect(sale.total).toBe('17.25');
  await expect(driverPage.getByRole('heading', { name: 'Sale ticket' })).toBeVisible();

  const deactivationResponsePromise = matchingResponse(
    administratorPage,
    `/customer-prices/${price.id}/deactivation`,
  );
  await administratorPage.getByRole('button', { name: 'Deactivate' }).click();
  expect((await deactivationResponsePromise).status()).toBe(200);
  await expect(administratorPage.getByText(/Inactive from/)).toBeVisible();

  await driverPage.goto('/sales/new');
  await driverPage.getByRole('combobox', { name: 'Customer' }).click();
  await driverPage.getByRole('option', { name: new RegExp(customerName) }).click();
  await driverPage.getByRole('button', { name: 'Next: products' }).click();
  await driverPage.getByRole('combobox', { name: 'Product' }).click();
  await driverPage.getByRole('option', { name: productName, exact: true }).click();
  await driverPage.getByLabel('Quantity').fill('1');
  await driverPage.getByRole('button', { name: 'Review authoritative quote' }).click();
  await expect(driverPage.getByText('Standard price')).toBeVisible();
  await expect(driverPage.getByText('MXN 20').last()).toBeVisible();

  await administratorPage.goto('/customers');
  await administratorPage.getByLabel('Search customers').fill(customerName);
  await administratorPage
    .getByRole('button', { name: new RegExp(customer.customerNumber) })
    .click();
  const history = administratorPage.getByRole('table', { name: 'Customer purchase history' });
  await expect(history.getByText(sale.saleNumber)).toBeVisible();
  await expect(history.getByText('MXN 17.25')).toBeVisible();

  await administratorPage.getByLabel('Archive reason').fill('Customer account closed');
  const archiveResponsePromise = matchingResponse(
    administratorPage,
    `/customers/${customer.id}`,
    'PATCH',
  );
  await administratorPage.getByRole('button', { name: 'Archive customer' }).click();
  const archiveResponse = await archiveResponsePromise;
  expect(archiveResponse.status()).toBe(200);
  await expect(administratorPage.getByText('Archived').last()).toBeVisible();
  await expect(history.getByText(sale.saleNumber)).toBeVisible();

  await driverPage.goto('/customers');
  await driverPage.getByLabel('Search customers').fill(customerName);
  await expect(
    driverPage.getByRole('button', { name: new RegExp(customer.customerNumber) }),
  ).toHaveCount(0);
  await expect(driverPage.getByText('No customers match these filters.')).toBeVisible();

  await closeReturnedRoute(
    administratorPage,
    administratorCsrf,
    driverPage,
    driverCsrf,
    activeRoute,
  );
});

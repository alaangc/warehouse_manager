import type { Page } from '@playwright/test';
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

interface RouteResource extends Resource {
  routeNumber: string;
  state: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';
}

interface RouteDetail {
  route: RouteResource;
  load: Resource & { state: 'DRAFT' | 'CONFIRMED' };
  balances: Array<{ productId: string; quantity: string }>;
  movements: Array<{ operationType: string; productId: string; quantity: string }>;
  reconciliation: {
    state: 'APPROVED';
    lines: Array<{
      productId: string;
      physicalReturnQuantity: string;
      differenceQuantity: string;
      differenceReason: string | null;
    }>;
  };
}

interface ApiEnvelope<T> {
  data: T;
}

interface BrowserResponse {
  status(): number;
  text(): Promise<string>;
  json<T>(): Promise<T>;
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

async function apiCall(
  page: Page,
  csrfToken: string,
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<BrowserResponse> {
  const result = await page.evaluate(
    async ({ csrfToken, idempotencyKey, method, path, body }) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      };
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const response = await fetch(`/api/v1${path}`, {
        method,
        headers,
        body: JSON.stringify(body),
        credentials: 'include',
      });
      return { status: response.status, text: await response.text() };
    },
    { csrfToken, idempotencyKey, method, path, body },
  );
  return {
    status: () => result.status,
    text: async () => result.text,
    json: async <T>() => JSON.parse(result.text) as T,
  };
}

async function apiGet(page: Page, path: string): Promise<BrowserResponse> {
  const result = await page.evaluate(async (path) => {
    const response = await fetch(`/api/v1${path}`, { credentials: 'include' });
    return { status: response.status, text: await response.text() };
  }, path);
  return {
    status: () => result.status,
    text: async () => result.text,
    json: async <T>() => JSON.parse(result.text) as T,
  };
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
  const response = await apiCall(page, csrfToken, method, path, body, idempotencyKey);
  if (response.status() !== expectedStatus) {
    throw new Error(`${method} ${path} returned ${response.status()}: ${await response.text()}`);
  }
  return (await response.json<ApiEnvelope<T>>()).data;
}

function newIdempotencyKey(label: string): string {
  return `e2e-route-${label}-${crypto.randomUUID()}`;
}

test('route lifecycle remains retry-safe, reconciled, scoped, and immutable', async ({
  administratorPage,
  browser,
  driverPage,
}, testInfo) => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to run against the isolated full stack.');

  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`
    .replace(/[^a-z0-9]/gi, '')
    .slice(-20);
  const routeNumber = `E2E-ROUTE-${suffix}`;
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
    { code: `UR${suffix}`, name: `Route unit ${suffix}`, quantityScale: 0 },
    201,
  );
  const category = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/categories',
    { name: `Route category ${suffix}`, reportingGroup: 'OTHER' },
    201,
  );
  const vehicle = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/vehicles',
    {
      code: `VR${suffix}`,
      name: `Route vehicle ${suffix}`,
      registration: `ROUTE-${suffix}`,
    },
    201,
  );
  const shortageProduct = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/products',
    {
      sku: `SHORT-${suffix}`,
      name: `Shortage product ${suffix}`,
      categoryId: category.id,
      unitId: unit.id,
      standardUnitPrice: '10.00',
      lowStockThreshold: '1',
      description: 'Route shortage fixture',
    },
    201,
  );
  const overageProduct = await apiMutation<Resource>(
    administratorPage,
    administratorCsrf,
    'POST',
    '/products',
    {
      sku: `OVER-${suffix}`,
      name: `Overage product ${suffix}`,
      categoryId: category.id,
      unitId: unit.id,
      standardUnitPrice: '12.00',
      lowStockThreshold: '1',
      description: 'Route overage fixture',
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
      reason: `Route stock ${suffix}`,
      lines: [
        { productId: shortageProduct.id, quantity: '10' },
        { productId: overageProduct.id, quantity: '10' },
      ],
    },
    201,
    newIdempotencyKey('stock'),
  );
  const createdRoute = await apiMutation<RouteResource>(
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
  await driverPage.goto(`/routes?routeId=${createdRoute.id}`);
  await expect(driverPage.getByRole('heading', { name: routeNumber })).toBeVisible();
  const productFields = driverPage.getByLabel('Product ID');
  const quantityFields = driverPage.getByLabel('Load quantity');
  await productFields.first().fill(shortageProduct.id);
  await quantityFields.first().fill('5');
  await driverPage.getByRole('button', { name: 'Add product' }).click();
  await productFields.nth(1).fill(overageProduct.id);
  await quantityFields.nth(1).fill('5');
  const draftResponse = driverPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/routes/${createdRoute.id}/load` &&
      response.request().method() === 'PUT',
  );
  await driverPage.getByRole('button', { name: 'Save full load' }).click();
  expect((await draftResponse).status()).toBe(200);
  await expect(driverPage.getByRole('button', { name: 'Confirm load' })).toBeVisible();

  const confirmationKeys: string[] = [];
  let confirmationCommitted = false;
  await driverPage.route('**/api/v1/routes/*/load/confirmation', async (intercept) => {
    const request = intercept.request();
    if (
      new URL(request.url()).pathname !== `/api/v1/routes/${createdRoute.id}/load/confirmation` ||
      request.method() !== 'POST'
    ) {
      await intercept.continue();
      return;
    }
    confirmationKeys.push(request.headers()['idempotency-key'] ?? '');
    if (!confirmationCommitted) {
      const response = await intercept.fetch();
      expect(response.status()).toBe(200);
      confirmationCommitted = true;
      await intercept.abort('connectionfailed');
      return;
    }
    await intercept.continue();
  });

  await driverPage.getByRole('button', { name: 'Confirm load' }).click();
  await expect(driverPage.getByRole('alert')).toBeVisible();
  const replayResponse = driverPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/routes/${createdRoute.id}/load/confirmation` &&
      response.request().method() === 'POST',
  );
  await driverPage.getByRole('button', { name: 'Confirm load' }).click();
  expect((await replayResponse).status()).toBe(200);
  expect(confirmationKeys).toHaveLength(2);
  expect(confirmationKeys[0]).toBeTruthy();
  expect(confirmationKeys[1]).toBe(confirmationKeys[0]);
  await driverPage.unroute('**/api/v1/routes/*/load/confirmation');
  await expect(driverPage.getByRole('button', { name: 'Start route' })).toBeVisible();

  const invalidReturn = await apiCall(
    driverPage,
    driverCsrf,
    'POST',
    `/routes/${createdRoute.id}/return`,
    { expectedVersion: createdRoute.version },
    newIdempotencyKey('invalid-return'),
  );
  expect(invalidReturn.status()).toBe(409);
  expect((await invalidReturn.json<{ code: string }>()).code).toBe('INVALID_ROUTE_TRANSITION');

  const startResponse = driverPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/routes/${createdRoute.id}/start` &&
      response.request().method() === 'POST',
  );
  await driverPage.getByRole('button', { name: 'Start route' }).click();
  expect((await startResponse).status()).toBe(200);
  await expect(driverPage.getByRole('button', { name: 'Mark returned' })).toBeVisible();
  const returnResponse = driverPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/routes/${createdRoute.id}/return` &&
      response.request().method() === 'POST',
  );
  await driverPage.getByRole('button', { name: 'Mark returned' }).click();
  expect((await returnResponse).status()).toBe(200);

  await administratorPage.goto(`/routes?routeId=${createdRoute.id}`);
  await expect(administratorPage.getByRole('heading', { name: routeNumber })).toBeVisible();
  const physicalReturns = administratorPage.getByLabel(/Physical return/);
  const differenceReasons = administratorPage.getByLabel('Difference reason');
  await expect(physicalReturns).toHaveCount(2);
  await physicalReturns.nth(0).fill('4');
  await differenceReasons.nth(0).fill(`Shortage ${suffix}`);
  await physicalReturns.nth(1).fill('6');
  await differenceReasons.nth(1).fill(`Overage ${suffix}`);
  const reconciliationResponse = administratorPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/routes/${createdRoute.id}/reconciliation` &&
      response.request().method() === 'PUT',
  );
  await administratorPage.getByRole('button', { name: 'Approve reconciliation' }).click();
  expect((await reconciliationResponse).status()).toBe(200);
  await expect(administratorPage.getByRole('button', { name: 'Close route' })).toBeVisible();
  const closeResponse = administratorPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/routes/${createdRoute.id}/close` &&
      response.request().method() === 'POST',
  );
  await administratorPage.getByRole('button', { name: 'Close route' }).click();
  expect((await closeResponse).status()).toBe(200);
  await expect(administratorPage.getByText('Read only').first()).toBeVisible();

  await driverPage.goto(`/routes?routeId=${createdRoute.id}`);
  await expect(driverPage.getByRole('heading', { name: routeNumber })).toBeVisible();
  await expect(driverPage.getByText('Read only').first()).toBeVisible();
  await expect(driverPage.getByText(/Positive adjustment/)).toBeVisible();
  await expect(driverPage.getByText(/Negative adjustment/)).toBeVisible();
  await expect(driverPage.getByText(`Shortage ${suffix}`, { exact: false })).toBeVisible();
  await expect(driverPage.getByText(`Overage ${suffix}`, { exact: false })).toBeVisible();
  await expect(driverPage.getByRole('button', { name: 'Save full load' })).toHaveCount(0);
  await expect(driverPage.getByRole('button', { name: 'Start route' })).toHaveCount(0);
  await expect(driverPage.getByRole('button', { name: 'Mark returned' })).toHaveCount(0);

  const closedDetailResponse = await apiGet(driverPage, `/routes/${createdRoute.id}`);
  expect(closedDetailResponse.status()).toBe(200);
  const closedDetail = (await closedDetailResponse.json<ApiEnvelope<RouteDetail>>()).data;
  expect(closedDetail.route.state).toBe('CLOSED');
  expect(closedDetail.balances.map((balance) => balance.quantity)).toEqual(['0.000', '0.000']);
  expect(closedDetail.reconciliation.lines.map((line) => line.differenceQuantity).sort()).toEqual([
    '-1.000',
    '1.000',
  ]);
  expect(closedDetail.movements.map((movement) => movement.operationType).sort()).toEqual([
    'NEGATIVE_ADJUSTMENT',
    'POSITIVE_ADJUSTMENT',
    'ROUTE_LOAD',
    'ROUTE_LOAD',
    'ROUTE_RETURN',
    'ROUTE_RETURN',
  ]);

  const postCloseLoad = await apiCall(
    driverPage,
    driverCsrf,
    'PUT',
    `/routes/${createdRoute.id}/load`,
    {
      expectedVersion: closedDetail.load.version,
      lines: [{ productId: shortageProduct.id, quantity: '1' }],
    },
  );
  expect(postCloseLoad.status()).toBe(409);
  expect((await postCloseLoad.json<{ code: string }>()).code).toBe('ROUTE_NOT_PREPARING');
  const postCloseReturn = await apiCall(
    driverPage,
    driverCsrf,
    'POST',
    `/routes/${createdRoute.id}/return`,
    { expectedVersion: closedDetail.route.version },
    newIdempotencyKey('closed-return'),
  );
  expect(postCloseReturn.status()).toBe(409);
  expect((await postCloseReturn.json<{ code: string }>()).code).toBe('INVALID_ROUTE_TRANSITION');
  const repeatedReconciliation = await apiCall(
    administratorPage,
    administratorCsrf,
    'PUT',
    `/routes/${createdRoute.id}/reconciliation`,
    {
      expectedVersion: closedDetail.route.version,
      lines: [
        { productId: shortageProduct.id, physicalReturnQuantity: '0' },
        { productId: overageProduct.id, physicalReturnQuantity: '0' },
      ],
    },
    newIdempotencyKey('closed-reconciliation'),
  );
  expect(repeatedReconciliation.status()).toBe(409);
  expect((await repeatedReconciliation.json<{ code: string }>()).code).toBe('ROUTE_NOT_RETURNED');

  const anotherContext = await browser.newContext();
  const anotherPage = await anotherContext.newPage();
  try {
    await login(anotherPage, anotherDriver.username);
    const deniedDetailPromise = anotherPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/v1/routes/${createdRoute.id}` &&
        response.request().method() === 'GET',
    );
    await anotherPage.goto(`/routes?routeId=${createdRoute.id}`);
    const deniedDetail = await deniedDetailPromise;
    expect(deniedDetail.status()).toBe(403);
    expect((await deniedDetail.json<{ code: string }>()).code).toBe('ROUTE_FORBIDDEN');
    await expect(anotherPage.getByRole('heading', { name: routeNumber })).toHaveCount(0);
    const deniedFilter = await apiGet(
      anotherPage,
      `/routes?driverId=${assignedDriver.id}&state=CLOSED`,
    );
    expect(deniedFilter.status()).toBe(200);
    const filteredRoutes = await deniedFilter.json<ApiEnvelope<RouteResource[]>>();
    expect(filteredRoutes.data.some((candidate) => candidate.id === createdRoute.id)).toBe(false);
  } finally {
    await anotherContext.close();
  }
});

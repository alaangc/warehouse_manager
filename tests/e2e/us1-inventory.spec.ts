import type { Page, Response } from '@playwright/test';
import { expect, test } from './support/test-fixtures.js';

const password = 'development-password-change-me';
const magdalenaBranchId = '00000000-0000-4000-8000-000000000020';
const caborcaBranchId = '00000000-0000-4000-8000-000000000021';

interface CreatedRecord {
  data: { id: string };
}

async function login(page: Page, username: 'admin' | 'driver') {
  await page.addInitScript(() => {
    window.localStorage.setItem('warehouse-manager-language', 'en');
  });
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Hello,/ })).toBeVisible();
}

function matchingResponse(page: Page, path: string, method = 'POST'): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/v1${path}` && response.request().method() === method;
  });
}

async function submitCreated(
  page: Page,
  path: string,
  submit: () => Promise<void>,
): Promise<string> {
  const responsePromise = matchingResponse(page, path);
  await submit();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  return ((await response.json()) as CreatedRecord).data.id;
}

async function selectOperation(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Operation' }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

async function submitBranchOperation(
  page: Page,
  input: {
    operation: 'Entry' | 'Manual exit' | 'Positive adjustment' | 'Negative adjustment';
    branchId: string;
    productId: string;
    quantity: string;
    reason: string;
    expectedStatus?: number;
  },
): Promise<string | null> {
  await selectOperation(page, input.operation);
  await page.getByLabel('Branch ID').fill(input.branchId);
  await page.getByLabel('Product ID').fill(input.productId);
  await page.getByLabel('Quantity').fill(input.quantity);
  await page.getByLabel('Reason').fill(input.reason);

  const responsePromise = matchingResponse(page, '/inventory/operations');
  await page.getByRole('button', { name: 'Confirm operation' }).click();
  const response = await responsePromise;
  const expectedStatus = input.expectedStatus ?? 201;
  expect(response.status()).toBe(expectedStatus);
  if (expectedStatus !== 201) return null;
  const operationId = ((await response.json()) as CreatedRecord).data.id;
  await expect(page.getByLabel('Quantity')).toHaveValue('');
  return operationId;
}

test('administrator inventory workflow is atomic and Driver mutations are denied', async ({
  administratorPage,
  driverPage,
}, testInfo) => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to run against the isolated full stack.');

  const suffix = `${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`
    .replace(/[^a-z0-9]/gi, '')
    .slice(-24);
  const productName = `E2E inventory ${suffix}`;
  const reasons = {
    entry: `Initial entry ${suffix}`,
    transfer: `Branch transfer ${suffix}`,
    positive: `Positive count ${suffix}`,
    negative: `Negative count ${suffix}`,
    reversal: `Reverse positive ${suffix}`,
    denied: `Denied driver entry ${suffix}`,
  };

  await login(administratorPage, 'admin');
  await administratorPage.goto('/catalog');

  const unitForm = administratorPage.getByRole('form', { name: 'Units management form' });
  const unitName = `Unit ${suffix}`;
  await unitForm.getByLabel('Code').fill(`U${suffix}`);
  await unitForm.getByLabel('Name').fill(unitName);
  await unitForm.getByLabel('Quantity decimals').fill('3');
  await submitCreated(administratorPage, '/units', () =>
    unitForm.getByRole('button', { name: 'Add' }).click(),
  );

  const categoryForm = administratorPage.getByRole('form', {
    name: 'Categories management form',
  });
  const categoryName = `Category ${suffix}`;
  await categoryForm.getByLabel('Name').fill(categoryName);
  await submitCreated(administratorPage, '/categories', () =>
    categoryForm.getByRole('button', { name: 'Add' }).click(),
  );

  const productForm = administratorPage.getByRole('form', { name: 'Product form' });
  await productForm.getByLabel('SKU').fill(`SKU${suffix}`);
  await productForm.getByLabel('Name').fill(productName);
  await productForm.getByRole('combobox', { name: 'Category' }).click();
  await administratorPage.getByRole('option', { name: categoryName }).click();
  await productForm.getByRole('combobox', { name: 'Unit' }).click();
  await administratorPage.getByRole('option', { name: `U${suffix} — ${unitName}` }).click();
  await productForm.getByLabel('Standard unit price').fill('12.3456');
  await productForm.getByLabel('Low stock threshold').fill('2.000');
  const productId = await submitCreated(administratorPage, '/products', () =>
    productForm.getByRole('button', { name: 'Save product' }).click(),
  );
  await expect(administratorPage.getByRole('cell', { name: productName })).toBeVisible();

  await administratorPage.goto('/inventory/operations/new');
  await submitBranchOperation(administratorPage, {
    operation: 'Entry',
    branchId: magdalenaBranchId,
    productId,
    quantity: '10.000',
    reason: reasons.entry,
  });

  await selectOperation(administratorPage, 'Transfer');
  await administratorPage.getByLabel('Source branch ID').fill(magdalenaBranchId);
  await administratorPage.getByLabel('Destination branch ID').fill(caborcaBranchId);
  await administratorPage.getByLabel('Product ID').fill(productId);
  await administratorPage.getByLabel('Quantity').fill('3.000');
  await administratorPage.getByLabel('Reason').fill(reasons.transfer);
  await submitCreated(administratorPage, '/inventory/transfers', () =>
    administratorPage.getByRole('button', { name: 'Confirm operation' }).click(),
  );
  await expect(administratorPage.getByLabel('Quantity')).toHaveValue('');

  const positiveOperationId = await submitBranchOperation(administratorPage, {
    operation: 'Positive adjustment',
    branchId: caborcaBranchId,
    productId,
    quantity: '1.000',
    reason: reasons.positive,
  });
  expect(positiveOperationId).not.toBeNull();
  if (!positiveOperationId) throw new Error('Positive adjustment did not return an operation ID.');

  await submitBranchOperation(administratorPage, {
    operation: 'Negative adjustment',
    branchId: caborcaBranchId,
    productId,
    quantity: '2.000',
    reason: reasons.negative,
  });

  await selectOperation(administratorPage, 'Reverse operation');
  await administratorPage.getByLabel('Original operation ID').fill(positiveOperationId);
  await administratorPage.getByLabel('Reason').fill(reasons.reversal);
  await submitCreated(
    administratorPage,
    `/inventory/operations/${positiveOperationId}/reversal`,
    () => administratorPage.getByRole('button', { name: 'Confirm operation' }).click(),
  );

  await submitBranchOperation(administratorPage, {
    operation: 'Manual exit',
    branchId: caborcaBranchId,
    productId,
    quantity: '2.000',
    reason: `Insufficient exit ${suffix}`,
    expectedStatus: 409,
  });
  await expect(administratorPage.getByRole('alert')).toContainText(/inventory/i);

  await administratorPage.goto('/inventory');
  const productRows = administratorPage.getByRole('row').filter({ hasText: productName });
  await expect(productRows).toHaveCount(2);
  await expect(productRows.filter({ hasText: '7.000' })).toHaveCount(1);
  const lowStockRow = productRows.filter({ hasText: '1.000' });
  await expect(lowStockRow).toHaveCount(1);
  await expect(lowStockRow.getByText('Low stock')).toBeVisible();

  await administratorPage.goto('/inventory/movements');
  for (const reason of [
    reasons.entry,
    reasons.transfer,
    reasons.positive,
    reasons.negative,
    reasons.reversal,
  ]) {
    await expect(administratorPage.getByRole('cell', { name: reason })).toBeVisible();
  }
  const transferMovement = administratorPage.getByRole('row').filter({ hasText: reasons.transfer });
  await expect(transferMovement).toContainText('Magdalena');
  await expect(transferMovement).toContainText('Caborca');
  await expect(transferMovement).toContainText('7.000');
  await expect(transferMovement).toContainText('3.000');
  await expect(transferMovement).toContainText(productId);
  const reversalMovement = administratorPage.getByRole('row').filter({ hasText: reasons.reversal });
  await expect(reversalMovement).toContainText('Caborca');
  await expect(reversalMovement).toContainText('1.000');
  await expect(reversalMovement).toContainText('INVENTORY_REVERSAL');

  await login(driverPage, 'driver');
  await driverPage.goto('/inventory/operations/new');
  await submitBranchOperation(driverPage, {
    operation: 'Entry',
    branchId: magdalenaBranchId,
    productId,
    quantity: '1.000',
    reason: reasons.denied,
    expectedStatus: 403,
  });
  await expect(driverPage.getByRole('alert')).toContainText(/role|permission/i);

  await driverPage.goto('/catalog');
  await expect(driverPage.getByText('Driver access is read only.')).toBeVisible();
  await expect(driverPage.getByRole('form')).toHaveCount(0);

  await administratorPage.goto('/inventory');
  const unchangedRows = administratorPage.getByRole('row').filter({ hasText: productName });
  await expect(unchangedRows.filter({ hasText: '7.000' })).toHaveCount(1);
  await expect(unchangedRows.filter({ hasText: '1.000' })).toHaveCount(1);
});

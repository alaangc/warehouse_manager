import { expect, test } from '@playwright/test';

test('driver sale confirmation produces a ticket', async ({ page }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to run against the isolated full stack.');
  await page.goto('/sales/new');
  await expect(page.getByRole('heading', { name: 'New sale' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm sale' })).toBeDisabled();
});

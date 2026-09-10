import { test, expect } from '@playwright/test';

test('T115 manages users and business settings on desktop and mobile', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('warehouse-manager-language', 'en'));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.locator('input[name="password"]').fill('development-password-change-me');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  await page.goto('/users');
  await page.getByRole('button', { name: 'New user', exact: true }).click();
  const name = `T115-${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel('Username', { exact: true }).fill(name);
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Password', { exact: true }).fill('new-driver-password-123');
  await page.getByRole('button', { name: 'Save user', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Changes saved.');
  await page.getByLabel('Search users').fill(name);

  const driverContext = await browser.newContext();
  await driverContext.addInitScript(() => localStorage.setItem('warehouse-manager-language', 'en'));
  const driverPage = await driverContext.newPage();
  await driverPage.goto(`${new URL(page.url()).origin}/login`);
  await driverPage.getByLabel('Username').fill(name);
  await driverPage.locator('input[name="password"]').fill('new-driver-password-123');
  await driverPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(driverPage).not.toHaveURL(/login/);
  await driverPage.goto(`${new URL(page.url()).origin}/users`);
  await expect(driverPage.getByRole('alert')).toHaveText(
    'Administrator permission is required to manage users.',
  );
  expect(
    (await driverContext.request.get(`${new URL(page.url()).origin}/api/v1/users`)).status(),
  ).toBe(403);
  expect(
    (
      await driverContext.request.get(`${new URL(page.url()).origin}/api/v1/settings/business`)
    ).status(),
  ).toBe(403);
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(page.getByLabel('Username', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: 'Status', exact: true }).last().click();
  await page.getByRole('option', { name: 'Inactive', exact: true }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Temporary leave');
  await page.screenshot({ path: testInfo.outputPath('users-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save user', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Changes saved.');
  await driverPage.reload();
  await expect(driverPage).toHaveURL(/login/);
  await driverContext.close();
  await page.reload();
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Status', exact: true }).last()).toHaveText(
    'Inactive',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('users-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/settings');
  const concurrent = await page.context().newPage();
  await concurrent.goto('/settings');
  await concurrent.getByLabel('Business timezone').fill('America/Phoenix');
  await concurrent.getByLabel('Reason', { exact: true }).fill('Concurrent administrator change');
  await concurrent.getByRole('button', { name: 'Save business settings', exact: true }).click();
  await expect(concurrent.getByRole('alert')).toHaveText('Changes saved.');
  await concurrent.close();
  await page.getByLabel('Business timezone').fill('America/Tijuana');
  await page.getByLabel('Reason', { exact: true }).fill('T115 test operating timezone');
  await page.getByRole('button', { name: 'Save business settings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Discard edits and reload current record' }),
  ).toBeVisible();
  await expect(page.getByLabel('Business timezone')).toHaveValue('America/Tijuana');
  await page.getByRole('button', { name: 'Discard edits and reload current record' }).click();
  await expect(page.getByLabel('Business timezone')).toHaveValue('America/Phoenix');
  await page.getByLabel('Business timezone').fill('America/Tijuana');
  await page.getByLabel('Reason', { exact: true }).fill('T115 test operating timezone');
  await page.getByRole('button', { name: 'Save business settings', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Changes saved.');
  await page.reload();
  await expect(page.getByLabel('Business timezone')).toHaveValue('America/Tijuana');
  await page.screenshot({ path: testInfo.outputPath('settings-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

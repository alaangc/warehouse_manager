import { test as base, expect } from '@playwright/test';

type WarehouseFixtures = {
  administratorPage: import('@playwright/test').Page;
  driverPage: import('@playwright/test').Page;
};

export const test = base.extend<WarehouseFixtures>({
  administratorPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  driverPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // E2E projects share seeded users and one database, so route workflows must not overlap.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : {
        command: process.env.E2E_ISOLATED_STACK
          ? 'pnpm exec tsx tests/e2e/support/start-isolated-stack.ts'
          : 'pnpm dev',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI && !process.env.E2E_ISOLATED_STACK,
        timeout: 120_000,
      },
});

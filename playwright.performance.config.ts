import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['performance-search.spec.ts', 'performance-success-criteria.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 900_000,
  forbidOnly: true,
  reporter: [['list']],
  outputDir: 'test-results/performance',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'off',
    screenshot: 'off',
    launchOptions: {
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    },
  },
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'performance-search.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], trace: 'off' },
  projects: [{ name: 'chromium-performance' }],
});

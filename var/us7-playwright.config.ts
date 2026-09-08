import base from '../playwright.config.js';
export default {
  ...base,
  testDir: '../tests/e2e',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5174', actionTimeout: 5000 },
  webServer: {
    command: 'pnpm.cmd --filter @warehouse/web dev --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chrome', use: { channel: 'chrome' } }],
  timeout: 20000,
  expect: { timeout: 3000 },
};

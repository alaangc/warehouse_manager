import { defineConfig } from 'vitest/config';

const coverage = {
  provider: 'v8' as const,
  reporter: ['text', 'json-summary'] as const,
  thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
};

export default defineConfig({
  test: {
    coverage,
    projects: [
      {
        test: {
          name: 'api-unit',
          root: 'apps/api',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'api-contract',
          root: 'apps/api',
          include: ['tests/contract/**/*.test.ts'],
          environment: 'node',
          sequence: { concurrent: false },
        },
      },
      {
        test: {
          name: 'api-integration',
          root: 'apps/api',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          hookTimeout: 120_000,
          testTimeout: 60_000,
          sequence: { concurrent: false },
        },
      },
      {
        test: {
          name: 'web',
          root: 'apps/web',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/setup.ts'],
        },
      },
    ],
  },
});

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.min.js',
      'var/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
  })),
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: [
      'apps/*/tests/**/*.{ts,tsx}',
      'tests/**/*.{ts,tsx}',
      'database/**/*.ts',
      'packages/*/scripts/**/*.ts',
      '*.config.{ts,js}',
      'vitest.workspace.ts',
    ],
  })),
);

import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { changeAppLanguage } from '../src/i18n/index.js';

beforeEach(async () => {
  await changeAppLanguage('en');
});

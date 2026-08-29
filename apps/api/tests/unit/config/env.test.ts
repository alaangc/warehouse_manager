import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../../src/config/env.js';

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:password@localhost:5432/database',
  SESSION_SECRET: 'a-secure-test-secret-that-is-long-enough',
  APP_ORIGIN: 'https://warehouse.example.test',
  BUSINESS_TIMEZONE: 'America/Hermosillo',
  BUSINESS_CURRENCY: 'MXN',
  PORT: '3000',
  LOG_LEVEL: 'info',
  DOCUMENT_STORAGE_PATH: '/tmp/warehouse-test-documents',
};

describe('loadEnvironment', () => {
  it('parses and normalizes a complete environment', () => {
    expect(loadEnvironment(valid)).toMatchObject({ PORT: 3000, BUSINESS_CURRENCY: 'MXN' });
  });

  it('rejects short secrets without exposing their value', () => {
    expect(() => loadEnvironment({ ...valid, SESSION_SECRET: 'secret' })).toThrow(
      'Invalid application configuration: SESSION_SECRET',
    );
  });

  it('rejects invalid timezones', () => {
    expect(() => loadEnvironment({ ...valid, BUSINESS_TIMEZONE: 'Mars/Olympus' })).toThrow(
      'BUSINESS_TIMEZONE',
    );
  });

  it('ignores unrelated operating-system environment variables', () => {
    expect(loadEnvironment({ ...valid, PATH: '/usr/bin', SHELL: '/bin/zsh' })).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3000,
    });
  });
});

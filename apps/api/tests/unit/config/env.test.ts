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
  it('reports malformed origins without leaking configuration values', () => {
    expect(() => loadEnvironment({ ...valid, APP_ORIGIN: 'invalid-private-value' })).toThrow(
      'Invalid application configuration: APP_ORIGIN',
    );
  });

  it('accepts an explicit production origin, random secret and proxy allowlist', () => {
    expect(
      loadEnvironment({
        ...valid,
        NODE_ENV: 'production',
        SESSION_SECRET: 'Q7m4W9x2A8c6K3t5R1v0B4n8L6s9D2f5',
        TRUST_PROXY: '127.0.0.1/32,::1/128',
      }).TRUST_PROXY,
    ).toBe('127.0.0.1/32,::1/128');
  });
  it.each([
    'http://warehouse.example.test',
    'https://warehouse.example.test/path',
    'https://user:pass@warehouse.example.test',
  ])('rejects unsafe production origins: %s', (APP_ORIGIN) => {
    expect(() => loadEnvironment({ ...valid, NODE_ENV: 'production', APP_ORIGIN })).toThrow(
      'APP_ORIGIN',
    );
  });

  it.each(['replace-with-at-least-32-random-characters', 'x'.repeat(64)])(
    'rejects production placeholder secrets',
    (SESSION_SECRET) => {
      expect(() => loadEnvironment({ ...valid, NODE_ENV: 'production', SESSION_SECRET })).toThrow(
        'SESSION_SECRET',
      );
    },
  );

  it.each(['true', '1', '0.0.0.0/0', '::/0', 'loopback', '127.0.0.1/33', ''])(
    'rejects broad or invalid proxy configuration: %s',
    (TRUST_PROXY) => {
      expect(() => loadEnvironment({ ...valid, TRUST_PROXY })).toThrow('TRUST_PROXY');
    },
  );

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

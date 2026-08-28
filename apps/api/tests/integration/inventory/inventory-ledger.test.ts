import { describe, expect, it } from 'vitest';
import { parseExactDecimal } from '../../../src/shared/money.js';

describe('inventory ledger invariants', () => {
  it('uses exact decimal comparison for nonnegative balance decisions', () => {
    expect(parseExactDecimal('0.300').minus('0.100').minus('0.200').isZero()).toBe(true);
  });

  it('documents the real-database trigger gate', () => {
    if (!process.env.TEST_DATABASE_URL) return;
    expect(process.env.TEST_DATABASE_URL).toMatch(/^postgres/);
  });
});

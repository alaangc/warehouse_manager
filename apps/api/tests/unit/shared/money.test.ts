import { describe, expect, it } from 'vitest';
import {
  calculateLineAmount,
  calculatePartnerShare,
  parseExactDecimal,
  sumMoney,
} from '../../../src/shared/money.js';
import { parseQuantity } from '../../../src/shared/quantity.js';

describe('exact financial arithmetic', () => {
  it('rejects malformed and exponential input', () => {
    expect(() => parseExactDecimal('1e3')).toThrow();
    expect(() => parseExactDecimal('NaN')).toThrow();
  });

  it('rounds line amounts half away from zero', () => {
    expect(calculateLineAmount('0.005', '1')).toBe('0.01');
    expect(calculateLineAmount('1.005', '1')).toBe('1.01');
  });

  it('sums stored rounded lines without binary floating point', () => {
    expect(sumMoney(['0.10', '0.20', '10.05'])).toBe('10.35');
  });

  it('calculates the fixed partner share and remainder once', () => {
    expect(calculatePartnerShare('10.01', '0.500000')).toEqual({
      partnerAmount: '5.01',
      remainingAmount: '5.00',
    });
  });

  it('enforces quantity precision', () => {
    expect(parseQuantity('3', 0)).toBe('3');
    expect(parseQuantity('1.250', 3)).toBe('1.250');
    expect(() => parseQuantity('1.5', 0)).toThrow();
  });
});

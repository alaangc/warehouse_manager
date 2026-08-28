import { describe, expect, it } from 'vitest';
import { calculatePricedLine } from '../../../src/modules/sales/pricing-service.js';

describe('sale pricing', () => {
  it('uses exact four-decimal unit prices and rounds each line half away from zero', () => {
    expect(calculatePricedLine('1.0050', '1')).toEqual({ unitPrice: '1.0050', lineAmount: '1.01' });
    expect(calculatePricedLine('12.3456', '2.500')).toEqual({
      unitPrice: '12.3456',
      lineAmount: '30.86',
    });
  });

  it('does not accept binary floating-point inputs', () => {
    expect(() => calculatePricedLine('1e2', '1')).toThrow();
  });
});

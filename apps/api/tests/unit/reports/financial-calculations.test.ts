import { describe, expect, it } from 'vitest';
import { calculateFinancialSummary } from '../../../src/modules/reports/financial-calculations.js';

describe('cash-close financial calculations', () => {
  it('rounds each line, sums every reporting group, and reconciles the exact gross total', () => {
    const result = calculateFinancialSummary([
      { reportingGroup: 'SODAS', unitPrice: '10.0050', quantity: '1' },
      { reportingGroup: 'SODAS', unitPrice: '0.3350', quantity: '3' },
      { reportingGroup: 'CHARCOAL', unitPrice: '2.5000', quantity: '2' },
      { reportingGroup: 'TOSTADAS', unitPrice: '0.3333', quantity: '3' },
      { reportingGroup: 'OTHER', unitPrice: '0.1000', quantity: '1' },
    ]);

    expect(result.lines.map((line) => line.lineAmount)).toEqual([
      '10.01',
      '1.01',
      '5.00',
      '1.00',
      '0.10',
    ]);
    expect(result.groupTotals).toEqual({
      SODAS: '11.02',
      CHARCOAL: '5.00',
      TOSTADAS: '1.00',
      OTHER: '0.10',
    });
    expect(result.grossTotal).toBe('17.12');
    expect(result).toMatchObject({
      partnerRate: '0.500000',
      partnerAmount: '8.56',
      remainingAmount: '8.56',
      roundingMode: 'HALF_AWAY_FROM_ZERO',
    });
  });

  it('uses decimal half-away rounding and subtracts the rounded share from gross', () => {
    const result = calculateFinancialSummary([
      { reportingGroup: 'OTHER', unitPrice: '1.0050', quantity: '1' },
      { reportingGroup: 'OTHER', unitPrice: '2.6750', quantity: '1' },
    ]);
    expect(result.lines.map((line) => line.lineAmount)).toEqual(['1.01', '2.68']);
    expect(result.grossTotal).toBe('3.69');
    expect(result.partnerAmount).toBe('1.85');
    expect(result.remainingAmount).toBe('1.84');
  });

  it('never exposes binary floating-point drift and emits absent groups as exact zero', () => {
    const result = calculateFinancialSummary([
      { reportingGroup: 'SODAS', unitPrice: '0.1000', quantity: '1' },
      { reportingGroup: 'SODAS', unitPrice: '0.2000', quantity: '1' },
    ]);
    expect(result.groupTotals).toEqual({
      SODAS: '0.30',
      CHARCOAL: '0.00',
      TOSTADAS: '0.00',
      OTHER: '0.00',
    });
    expect(result.grossTotal).toBe('0.30');
    expect(result.partnerAmount).toBe('0.15');
    expect(result.remainingAmount).toBe('0.15');
  });

  it('rejects malformed, negative, and unknown financial inputs', () => {
    expect(() =>
      calculateFinancialSummary([{ reportingGroup: 'OTHER', unitPrice: '1e2', quantity: '1' }]),
    ).toThrow('Invalid decimal string');
    expect(() =>
      calculateFinancialSummary([{ reportingGroup: 'OTHER', unitPrice: '-1.0000', quantity: '1' }]),
    ).toThrow('Money cannot be negative');
    expect(() =>
      calculateFinancialSummary([
        { reportingGroup: 'UNCLASSIFIED', unitPrice: '1.0000', quantity: '1' } as never,
      ]),
    ).toThrow('Invalid reporting group');
  });
});

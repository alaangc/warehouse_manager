import { Decimal } from 'decimal.js';

const ExactDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function parseExactDecimal(value: string): Decimal {
  if (!DECIMAL_PATTERN.test(value)) throw new Error('Invalid decimal string');
  const parsed = new ExactDecimal(value);
  if (!parsed.isFinite()) throw new Error('Decimal must be finite');
  return parsed;
}

export function canonicalDecimal(value: Decimal.Value, scale: number): string {
  return new ExactDecimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed(scale);
}

export function calculateLineAmount(unitPrice: string, quantity: string): string {
  const price = parseExactDecimal(unitPrice);
  const amount = price.mul(parseExactDecimal(quantity));
  if (price.isNegative() || amount.isNegative()) throw new Error('Money cannot be negative');
  return canonicalDecimal(amount, 2);
}

export function sumMoney(values: readonly string[]): string {
  const total = values.reduce(
    (sum, value) => sum.plus(parseExactDecimal(value)),
    new ExactDecimal(0),
  );
  return canonicalDecimal(total, 2);
}

export function calculatePartnerShare(
  grossTotal: string,
  partnerRate = '0.500000',
): { partnerAmount: string; remainingAmount: string } {
  const gross = parseExactDecimal(grossTotal);
  const rate = parseExactDecimal(partnerRate);
  if (gross.isNegative() || rate.isNegative() || rate.greaterThan(1)) {
    throw new Error('Invalid partner-share inputs');
  }
  const partnerAmount = canonicalDecimal(gross.mul(rate), 2);
  const remainingAmount = canonicalDecimal(gross.minus(parseExactDecimal(partnerAmount)), 2);
  return { partnerAmount, remainingAmount };
}

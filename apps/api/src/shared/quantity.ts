import { parseExactDecimal } from './money.js';

export function parseQuantity(
  value: string,
  scale: number,
  options?: { positive?: boolean },
): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 3) throw new Error('Invalid quantity scale');
  const quantity = parseExactDecimal(value);
  if (quantity.isNegative() || (options?.positive && quantity.isZero())) {
    throw new Error(
      options?.positive ? 'Quantity must be positive' : 'Quantity cannot be negative',
    );
  }
  if (quantity.decimalPlaces() > scale)
    throw new Error(`Quantity allows at most ${scale} decimals`);
  return quantity.toFixed(scale);
}

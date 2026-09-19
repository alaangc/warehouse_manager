import { currentLocale } from './index.js';

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(currentLocale());
}

export function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(currentLocale());
}

export function formatDecimal(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const formatter = new Intl.NumberFormat(currentLocale());
  const integer = BigInt(`${match[1]}${match[2]}`);
  const sign = match[1] === '-' && integer === 0n ? '-' : '';
  const whole = `${sign}${formatter.format(integer)}`;
  if (!match[3]) return whole;
  const separator = formatter.formatToParts(1.1).find((part) => part.type === 'decimal')!.value;
  // Format only the integer; retain the exact API fraction, including trailing zeros.
  return `${whole}${separator}${match[3]}`;
}

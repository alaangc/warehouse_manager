import { currentLocale } from './index.js';

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(currentLocale());
}

export function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(currentLocale());
}

export function formatDecimal(value: string): string {
  const fractionDigits = Math.min(value.split('.')[1]?.length ?? 0, 20);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat(currentLocale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(numeric);
}

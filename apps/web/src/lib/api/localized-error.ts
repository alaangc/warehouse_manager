import type { TFunction } from 'i18next';
import i18n from '../../i18n/index.js';
import { ApiProblem } from './problem.js';

const translatedCodes = new Set([
  'RESOURCE_FORBIDDEN',
  'RESOURCE_NOT_FOUND',
  'OPTIMISTIC_CONFLICT',
  'INSUFFICIENT_INVENTORY',
  'INVENTORY_CONFLICT',
  'IDEMPOTENCY_HASH_CONFLICT',
  'IDEMPOTENCY_IN_PROGRESS',
  'INVALID_ROUTE_TRANSITION',
  'ROUTE_FORBIDDEN',
  'PRODUCT_UNAVAILABLE',
  'CUSTOMER_UNAVAILABLE',
  'ROUTE_NOT_EN_ROUTE',
  'ARCHIVE_REASON_REQUIRED',
  'CATALOG_DUPLICATE',
  'CATALOG_REFERENCE_INVALID',
  'VEHICLE_ASSIGNED',
  'ROUTE_SCOPE_REQUIRED',
  'DIFFERENCE_REASON_REQUIRED',
  'SALE_ALREADY_CANCELLED',
]);

export function localizedErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiProblem) {
    if (!i18n.resolvedLanguage?.startsWith('es')) {
      return error.problem.detail ?? error.problem.title;
    }
    const code = error.problem.code;
    if (code && translatedCodes.has(code)) return t(`errors.${code}`);
  }
  return t('errors.generic');
}

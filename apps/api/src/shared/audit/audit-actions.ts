import type { AuditAction } from './audit-types.js';

const forbiddenFields = new Set([
  'password',
  'password_hash',
  'session',
  'session_id',
  'csrf',
  'csrf_secret_hash',
  'token',
  'secret',
  'device_handle',
]);

export const requiredReasonActions = new Set<AuditAction>([
  'USER_DEACTIVATED',
  'SALE_CANCELLED',
  'CASH_CLOSE_CORRECTED',
]);

export function assertSafeAuditFields(values: Record<string, unknown> | undefined): void {
  for (const key of Object.keys(values ?? {})) {
    if (forbiddenFields.has(key.toLowerCase())) throw new Error(`Forbidden audit field: ${key}`);
  }
}

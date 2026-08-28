import type { JsonValue } from '../../db/types.js';

export type AuditAction =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'SETTING_UPDATED'
  | 'CATALOG_CHANGED'
  | 'INVENTORY_CHANGED'
  | 'ROUTE_CHANGED'
  | 'SALE_CONFIRMED'
  | 'SALE_CANCELLED'
  | 'CASH_CLOSE_CREATED'
  | 'CASH_CLOSE_CORRECTED'
  | 'REPORT_SNAPSHOT_CREATED'
  | 'PRINTER_SETTING_CHANGED';

export type AuditEventInput = {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  reason?: string;
  before?: Record<string, JsonValue>;
  after?: Record<string, JsonValue>;
  operationId?: string;
  requestId?: string;
};

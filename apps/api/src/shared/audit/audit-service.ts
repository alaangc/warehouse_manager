import type { Transaction } from 'kysely';
import type { Database } from '../../db/types.js';
import { assertSafeAuditFields, requiredReasonActions } from './audit-actions.js';
import type { AuditEventInput } from './audit-types.js';

export class AuditWriter {
  async write(transaction: Transaction<Database>, event: AuditEventInput): Promise<string> {
    assertSafeAuditFields(event.before);
    assertSafeAuditFields(event.after);
    if (requiredReasonActions.has(event.action) && !event.reason?.trim()) {
      throw new Error(`Audit reason required for ${event.action}`);
    }
    const inserted = await transaction
      .insertInto('audit_event')
      .values({
        actor_id: event.actorId,
        action: event.action,
        entity_type: event.entityType,
        entity_id: event.entityId,
        reason: event.reason?.trim() || null,
        before_values: event.before ?? null,
        after_values: event.after ?? null,
        operation_id: event.operationId ?? null,
        request_id: event.requestId ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return inserted.id;
  }
}

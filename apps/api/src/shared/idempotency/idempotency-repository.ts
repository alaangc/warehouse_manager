import type { Transaction } from 'kysely';
import type { Database, JsonValue } from '../../db/types.js';

export type IdempotencyIdentity = {
  actorId: string;
  operationType: string;
  key: string;
  requestHash: string;
};

export type AcquiredIdempotency =
  | { kind: 'acquired'; id: string }
  | { kind: 'replay'; status: number; body: JsonValue }
  | { kind: 'in_progress' }
  | { kind: 'hash_conflict' };

export class IdempotencyRepository {
  async acquire(
    transaction: Transaction<Database>,
    identity: IdempotencyIdentity,
  ): Promise<AcquiredIdempotency> {
    const inserted = await transaction
      .insertInto('idempotency_request')
      .values({
        actor_id: identity.actorId,
        operation_type: identity.operationType,
        idempotency_key: identity.key,
        request_hash: identity.requestHash,
        state: 'IN_PROGRESS',
        resource_type: null,
        resource_id: null,
        http_status: null,
        response_snapshot: null,
        completed_at: null,
      })
      .onConflict((conflict) =>
        conflict.columns(['actor_id', 'operation_type', 'idempotency_key']).doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    if (inserted) return { kind: 'acquired', id: inserted.id };

    const existing = await transaction
      .selectFrom('idempotency_request')
      .select(['request_hash', 'state', 'http_status', 'response_snapshot'])
      .where('actor_id', '=', identity.actorId)
      .where('operation_type', '=', identity.operationType)
      .where('idempotency_key', '=', identity.key)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (existing.request_hash !== identity.requestHash) return { kind: 'hash_conflict' };
    if (existing.state === 'IN_PROGRESS') return { kind: 'in_progress' };
    return {
      kind: 'replay',
      status: existing.http_status ?? 200,
      body: existing.response_snapshot ?? null,
    };
  }

  async complete(
    transaction: Transaction<Database>,
    id: string,
    result: { resourceType: string; resourceId: string; status: number; body: JsonValue },
  ): Promise<void> {
    const updated = await transaction
      .updateTable('idempotency_request')
      .set({
        state: 'COMPLETED',
        resource_type: result.resourceType,
        resource_id: result.resourceId,
        http_status: result.status,
        response_snapshot: result.body,
        completed_at: new Date(),
      })
      .where('id', '=', id)
      .where('state', '=', 'IN_PROGRESS')
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) !== 1)
      throw new Error('Idempotency request was not acquired');
  }
}

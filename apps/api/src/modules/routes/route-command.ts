import type { Transaction } from 'kysely';
import type { Database, JsonValue } from '../../db/types.js';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency-repository.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';

export interface RouteCommandContext {
  actorId: string;
  idempotencyKey: string;
  requestId: string;
}

function snapshot(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export async function runRouteCommand<T extends { id: string }>(
  transaction: Transaction<Database>,
  options: {
    operationType: string;
    resourceType: string;
    request: JsonValue;
    context: RouteCommandContext;
  },
  execute: (idempotencyRequestId: string) => Promise<T>,
): Promise<T> {
  const repository = new IdempotencyRepository();
  const acquired = await repository.acquire(transaction, {
    actorId: options.context.actorId,
    operationType: options.operationType,
    key: options.context.idempotencyKey,
    requestHash: canonicalRequestHash(options.request),
  });
  if (acquired.kind === 'replay') return acquired.body as unknown as T;
  if (acquired.kind === 'hash_conflict')
    throw Object.assign(new Error('Idempotency key was used with different content'), {
      code: 'IDEMPOTENCY_HASH_CONFLICT',
    });
  if (acquired.kind === 'in_progress')
    throw Object.assign(new Error('Route command is already processing'), {
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
  const result = await execute(acquired.id);
  await repository.complete(transaction, acquired.id, {
    resourceType: options.resourceType,
    resourceId: result.id,
    status: 200,
    body: snapshot(result),
  });
  return result;
}

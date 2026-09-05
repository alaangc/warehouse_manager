import type { Transaction } from 'kysely';
import type { Database, JsonValue } from '../../db/types.js';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency-repository.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';

export interface ReportCommandContext {
  actorId: string;
  idempotencyKey: string;
  requestId: string;
}

export class ReportingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function runReportCommand<T extends { id: string }>(
  transaction: Transaction<Database>,
  operationType: string,
  resourceType: string,
  input: JsonValue,
  context: ReportCommandContext,
  execute: (idempotencyRequestId: string) => Promise<T>,
): Promise<T> {
  const actor = await transaction
    .selectFrom('app_user')
    .select(['role', 'active'])
    .where('id', '=', context.actorId)
    .executeTakeFirst();
  if (!actor?.active || actor.role !== 'ADMINISTRATOR')
    throw new ReportingError('REPORT_FORBIDDEN', 'Administrator access is required.');
  const repository = new IdempotencyRepository();
  const acquired = await repository.acquire(transaction, {
    actorId: context.actorId,
    operationType,
    key: context.idempotencyKey,
    requestHash: canonicalRequestHash(input),
  });
  if (acquired.kind === 'replay') return acquired.body as unknown as T;
  if (acquired.kind === 'hash_conflict')
    throw new ReportingError(
      'IDEMPOTENCY_KEY_REUSED',
      'This request key was already used with different content.',
    );
  if (acquired.kind === 'in_progress')
    throw new ReportingError('IDEMPOTENCY_IN_PROGRESS', 'The request is still processing.');
  const result = await execute(acquired.id);
  await repository.complete(transaction, acquired.id, {
    resourceType,
    resourceId: result.id,
    status: 201,
    body: JSON.parse(JSON.stringify(result)) as JsonValue,
  });
  return result;
}

import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../../db/database.js';
import type { InventoryOperationType, JsonValue } from '../../db/types.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency-repository.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';
import { parseQuantity } from '../../shared/quantity.js';
import { InventoryRepository } from './inventory-repository.js';

export interface InventoryLine {
  productId: string;
  quantity: string;
}
export interface OperationResult {
  id: string;
  operationType: InventoryOperationType;
  actorId: string;
  reason: string | null;
  movements: unknown[];
  occurredAt: string;
}
export interface OperationContext {
  actorId: string;
  idempotencyKey: string;
  requestId: string;
}

export class InventoryService {
  constructor(private readonly database: AppDatabase) {}

  createBranchOperation(
    input: {
      operationType: 'ENTRY' | 'MANUAL_EXIT' | 'POSITIVE_ADJUSTMENT' | 'NEGATIVE_ADJUSTMENT';
      branchId: string;
      reason: string;
      lines: InventoryLine[];
    },
    context: OperationContext,
  ) {
    const creation =
      input.operationType === 'ENTRY' || input.operationType === 'POSITIVE_ADJUSTMENT';
    return this.execute(
      input.operationType,
      input,
      context,
      async (repository, operationId, lines) => {
        const stockLocation = await repository.branchStockLocation(input.branchId);
        const movements = [];
        for (const line of lines)
          movements.push(
            await repository.applyMovement({
              operationId,
              productId: line.productId,
              sourceId: creation ? null : stockLocation,
              destinationId: creation ? stockLocation : null,
              quantity: line.quantity,
              actorId: context.actorId,
              reason: input.reason,
              relatedEntityType: 'INVENTORY_OPERATION',
              relatedEntityId: operationId,
            }),
          );
        return movements;
      },
    );
  }

  createTransfer(
    input: {
      sourceBranchId: string;
      destinationBranchId: string;
      reason: string;
      lines: InventoryLine[];
    },
    context: OperationContext,
  ) {
    return this.execute('TRANSFER', input, context, async (repository, operationId, lines) => {
      const [source, destination] = await Promise.all([
        repository.branchStockLocation(input.sourceBranchId),
        repository.branchStockLocation(input.destinationBranchId),
      ]);
      const movements = [];
      for (const line of lines)
        movements.push(
          await repository.applyMovement({
            operationId,
            productId: line.productId,
            sourceId: source,
            destinationId: destination,
            quantity: line.quantity,
            actorId: context.actorId,
            reason: input.reason,
            relatedEntityType: 'INVENTORY_OPERATION',
            relatedEntityId: operationId,
          }),
        );
      return movements;
    });
  }

  async reverse(
    operationId: string,
    reason: string,
    context: OperationContext,
  ): Promise<OperationResult> {
    const original = await this.database
      .selectFrom('inventory_operation')
      .selectAll()
      .where('id', '=', operationId)
      .executeTakeFirst();
    if (!original)
      throw Object.assign(new Error('Inventory operation not found'), {
        code: 'RESOURCE_NOT_FOUND',
      });
    const originalMovements = await this.database
      .selectFrom('inventory_movement')
      .selectAll()
      .where('operation_id', '=', operationId)
      .orderBy('id')
      .execute();
    return this.execute(
      original.operation_type,
      { operationId, reason },
      context,
      async (repository, reversalId) => {
        const movements = [];
        for (const movement of originalMovements)
          movements.push(
            await repository.applyMovement({
              operationId: reversalId,
              productId: movement.product_id,
              sourceId: movement.destination_stock_location_id,
              destinationId: movement.source_stock_location_id,
              quantity: movement.quantity,
              actorId: context.actorId,
              reason,
              relatedEntityType: 'INVENTORY_REVERSAL',
              relatedEntityId: operationId,
              reversesMovementId: movement.id,
            }),
          );
        return movements;
      },
      operationId,
    );
  }

  private async execute(
    operationType: InventoryOperationType,
    request: object,
    context: OperationContext,
    change: (
      repository: InventoryRepository,
      operationId: string,
      lines: InventoryLine[],
    ) => Promise<unknown[]>,
    reversesOperationId: string | null = null,
  ): Promise<OperationResult> {
    return runSerializable(this.database, async (transaction) => {
      const idempotency = new IdempotencyRepository();
      const requestHash = canonicalRequestHash(request as JsonValue);
      const acquired = await idempotency.acquire(transaction, {
        actorId: context.actorId,
        operationType: `INVENTORY_${operationType}`,
        key: context.idempotencyKey,
        requestHash,
      });
      if (acquired.kind === 'replay') return acquired.body as unknown as OperationResult;
      if (acquired.kind === 'hash_conflict')
        throw Object.assign(new Error('Idempotency key was used with different content'), {
          code: 'IDEMPOTENCY_HASH_CONFLICT',
        });
      if (acquired.kind === 'in_progress')
        throw Object.assign(new Error('Operation is already processing'), {
          code: 'IDEMPOTENCY_IN_PROGRESS',
        });
      const id = randomUUID();
      const reason =
        'reason' in request && typeof request.reason === 'string' ? request.reason : null;
      await transaction
        .insertInto('inventory_operation')
        .values({
          id,
          operation_type: operationType,
          actor_id: context.actorId,
          reason,
          related_entity_type: reversesOperationId ? 'INVENTORY_REVERSAL' : 'INVENTORY_OPERATION',
          related_entity_id: reversesOperationId ?? id,
          idempotency_request_id: acquired.id,
          reverses_operation_id: reversesOperationId,
        })
        .execute();
      const rawLines =
        'lines' in request && Array.isArray(request.lines)
          ? (request.lines as InventoryLine[])
          : [];
      const unitScales = rawLines.length
        ? await transaction
            .selectFrom('product')
            .innerJoin('unit', 'unit.id', 'product.unit_id')
            .select(['product.id', 'unit.quantity_scale'])
            .where(
              'product.id',
              'in',
              rawLines.map((line) => line.productId),
            )
            .execute()
        : [];
      const scales = new Map(unitScales.map((row) => [row.id, row.quantity_scale]));
      const lines = rawLines
        .map((line) => ({
          ...line,
          quantity: parseQuantity(line.quantity, scales.get(line.productId) ?? 3),
        }))
        .sort((left, right) => left.productId.localeCompare(right.productId));
      const movements = await change(new InventoryRepository(transaction), id, lines);
      await new AuditWriter().write(transaction, {
        actorId: context.actorId,
        action: 'INVENTORY_CHANGED',
        entityType: 'INVENTORY_OPERATION',
        entityId: id,
        ...(reason === null ? {} : { reason }),
        after: { operationType, movementCount: movements.length },
        operationId: id,
        requestId: context.requestId,
      });
      const occurred = await transaction
        .selectFrom('inventory_operation')
        .select('occurred_at')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      const result: OperationResult = {
        id,
        operationType,
        actorId: context.actorId,
        reason,
        movements,
        occurredAt: new Date(occurred.occurred_at).toISOString(),
      };
      await idempotency.complete(transaction, acquired.id, {
        resourceType: 'INVENTORY_OPERATION',
        resourceId: id,
        status: 201,
        body: result as unknown as JsonValue,
      });
      return result;
    });
  }
}

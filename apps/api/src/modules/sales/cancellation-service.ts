import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency-repository.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';
import { InventoryRepository } from '../inventory/inventory-repository.js';
import type { SaleContext } from './sale-service.js';

export class CancellationService {
  constructor(private readonly database: AppDatabase) {}

  cancel(saleId: string, reason: string, context: SaleContext) {
    return runSerializable(this.database, async (transaction) => {
      const idempotency = new IdempotencyRepository();
      const acquired = await idempotency.acquire(transaction, {
        actorId: context.actorId,
        operationType: 'SALE_CANCELLATION',
        key: context.idempotencyKey,
        requestHash: canonicalRequestHash({ saleId, reason }),
      });
      if (acquired.kind === 'replay') return acquired.body;
      if (acquired.kind !== 'acquired')
        throw Object.assign(new Error('Idempotency conflict'), {
          code:
            acquired.kind === 'hash_conflict'
              ? 'IDEMPOTENCY_HASH_CONFLICT'
              : 'IDEMPOTENCY_IN_PROGRESS',
        });
      const sale = await transaction
        .selectFrom('sale')
        .innerJoin('route', 'route.id', 'sale.route_id')
        .select([
          'sale.id',
          'sale.status',
          'sale.route_id',
          'sale.origin_location_id',
          'route.state',
        ])
        .where('sale.id', '=', saleId)
        .forUpdate('sale')
        .executeTakeFirst();
      if (!sale) throw Object.assign(new Error('Sale not found'), { code: 'RESOURCE_NOT_FOUND' });
      if (sale.status !== 'COMPLETED')
        throw Object.assign(new Error('Sale is already cancelled'), {
          code: 'SALE_ALREADY_CANCELLED',
        });
      const destination =
        sale.state === 'EN_ROUTE'
          ? await transaction
              .selectFrom('stock_location')
              .select('id')
              .where('route_id', '=', sale.route_id)
              .executeTakeFirstOrThrow()
          : await transaction
              .selectFrom('stock_location')
              .select('id')
              .where('branch_id', '=', sale.origin_location_id)
              .executeTakeFirstOrThrow();
      const lines = await transaction
        .selectFrom('sale_line')
        .select(['id', 'product_id', 'quantity'])
        .where('sale_id', '=', saleId)
        .orderBy('product_id')
        .execute();
      const operationId = randomUUID();
      await transaction
        .insertInto('inventory_operation')
        .values({
          id: operationId,
          operation_type: 'SALE_CANCELLATION',
          actor_id: context.actorId,
          reason,
          related_entity_type: 'SALE',
          related_entity_id: saleId,
          idempotency_request_id: null,
          reverses_operation_id: null,
        })
        .execute();
      const inventory = new InventoryRepository(transaction);
      for (const line of lines)
        await inventory.applyMovement({
          operationId,
          productId: line.product_id,
          sourceId: null,
          destinationId: destination.id,
          quantity: line.quantity,
          actorId: context.actorId,
          reason,
          relatedEntityType: 'SALE_CANCELLATION',
          relatedEntityId: saleId,
        });
      const cancellation = await transaction
        .insertInto('sale_cancellation')
        .values({
          sale_id: saleId,
          actor_id: context.actorId,
          reason,
          destination_stock_location_id: destination.id,
          inventory_operation_id: operationId,
          idempotency_request_id: acquired.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await transaction
        .updateTable('sale')
        .set({
          status: 'CANCELLED',
          cancelled_at: new Date(),
          cancelled_by: context.actorId,
          cancellation_reason: reason,
        })
        .where('id', '=', saleId)
        .where('status', '=', 'COMPLETED')
        .executeTakeFirstOrThrow();
      await new AuditWriter().write(transaction, {
        actorId: context.actorId,
        action: 'SALE_CANCELLED',
        entityType: 'SALE',
        entityId: saleId,
        reason,
        after: { status: 'CANCELLED', destinationStockLocationId: destination.id },
        operationId,
        requestId: context.requestId,
      });
      const result = {
        saleId,
        status: 'CANCELLED',
        cancellationId: cancellation.id,
        destinationStockLocationId: destination.id,
      };
      await idempotency.complete(transaction, acquired.id, {
        resourceType: 'SALE',
        resourceId: saleId,
        status: 200,
        body: result,
      });
      return result;
    });
  }
}

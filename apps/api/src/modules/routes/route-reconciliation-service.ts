import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { canonicalDecimal, parseExactDecimal } from '../../shared/money.js';
import { InventoryRepository } from '../inventory/inventory-repository.js';
import { calculateReconciliationLine } from './route-domain.js';
import { runRouteCommand, type RouteCommandContext } from './route-command.js';

export interface ReconciliationInput {
  expectedVersion: number;
  lines: {
    productId: string;
    physicalReturnQuantity: string;
    differenceReason?: string | null | undefined;
  }[];
}

export class RouteReconciliationService {
  constructor(private readonly database: AppDatabase) {}
  approve(routeId: string, input: ReconciliationInput, context: RouteCommandContext) {
    return runSerializable(this.database, async (transaction) => {
      return runRouteCommand(
        transaction,
        {
          operationType: 'ROUTE_RECONCILE',
          resourceType: 'ROUTE_RECONCILIATION',
          request: {
            routeId,
            expectedVersion: input.expectedVersion,
            lines: input.lines.map((line) => ({
              productId: line.productId,
              physicalReturnQuantity: line.physicalReturnQuantity,
              differenceReason: line.differenceReason ?? null,
            })),
          },
          context,
        },
        async (idempotencyRequestId) => {
          const route = await transaction
            .selectFrom('route')
            .innerJoin('stock_location as route_stock', 'route_stock.route_id', 'route.id')
            .select([
              'route.id',
              'route.state',
              'route.origin_location_id',
              'route.version',
              'route_stock.id as routeStockId',
            ])
            .where('route.id', '=', routeId)
            .forUpdate('route')
            .executeTakeFirst();
          if (!route)
            throw Object.assign(new Error('Route not found'), { code: 'RESOURCE_NOT_FOUND' });
          if (route.state !== 'RETURNED')
            throw Object.assign(new Error('Only Returned routes can be reconciled'), {
              code: 'ROUTE_NOT_RETURNED',
            });
          if (route.version !== input.expectedVersion)
            throw Object.assign(new Error('Route changed concurrently'), {
              code: 'OPTIMISTIC_CONFLICT',
            });
          const existing = await transaction
            .selectFrom('route_reconciliation')
            .select('id')
            .where('route_id', '=', routeId)
            .executeTakeFirst();
          if (existing)
            throw Object.assign(new Error('Route is already reconciled'), {
              code: 'RECONCILIATION_EXISTS',
            });
          const load = await transaction
            .selectFrom('route_load')
            .select('id')
            .where('route_id', '=', routeId)
            .where('state', '=', 'CONFIRMED')
            .executeTakeFirstOrThrow();
          const loaded = await transaction
            .selectFrom('route_load_line')
            .selectAll()
            .where('route_load_id', '=', load.id)
            .orderBy('product_id')
            .execute();
          const requested = new Map(input.lines.map((line) => [line.productId, line]));
          if (
            loaded.length !== requested.size ||
            loaded.some((line) => !requested.has(line.product_id))
          )
            throw Object.assign(
              new Error('Physical return must cover every loaded product exactly once'),
              { code: 'RECONCILIATION_LINES_INVALID' },
            );
          const reconciliationId = randomUUID();
          const returnOperationId = randomUUID();
          await transaction
            .insertInto('inventory_operation')
            .values({
              id: returnOperationId,
              operation_type: 'ROUTE_RETURN',
              actor_id: context.actorId,
              reason: 'Approved route reconciliation',
              related_entity_type: 'ROUTE_RECONCILIATION',
              related_entity_id: reconciliationId,
              idempotency_request_id: idempotencyRequestId,
              reverses_operation_id: null,
            })
            .execute();
          const inventory = new InventoryRepository(transaction);
          const originStockId = await inventory.branchStockLocation(route.origin_location_id);
          const records: Array<{
            productId: string;
            loaded: string;
            sold: string;
            expected: string;
            physical: string;
            difference: string;
            reason: string | null;
            adjustmentMovementId: string | null;
            productName: string;
            unitCode: string;
          }> = [];
          for (const loadLine of loaded) {
            const soldResult = await transaction
              .selectFrom('sale_line')
              .innerJoin('sale', 'sale.id', 'sale_line.sale_id')
              .select(sql<string>`coalesce(sum(sale_line.quantity), 0)::text`.as('quantity'))
              .where('sale.route_id', '=', routeId)
              .where('sale.status', '=', 'COMPLETED')
              .where('sale_line.product_id', '=', loadLine.product_id)
              .executeTakeFirstOrThrow();
            const request = requested.get(loadLine.product_id)!;
            const calculated = calculateReconciliationLine(
              loadLine.quantity,
              soldResult.quantity,
              request.physicalReturnQuantity,
            );
            const sold = calculated.sold;
            const expected = calculated.expectedReturn;
            const physical = calculated.physicalReturn;
            const difference = calculated.difference;
            const nonzero = !parseExactDecimal(difference).isZero();
            if (nonzero && !request.differenceReason?.trim())
              throw Object.assign(new Error('Every difference requires a reason'), {
                code: 'DIFFERENCE_REASON_REQUIRED',
              });
            if (!nonzero && request.differenceReason)
              throw Object.assign(new Error('Zero difference cannot have a reason'), {
                code: 'UNEXPECTED_DIFFERENCE_REASON',
              });
            let adjustmentMovementId: string | null = null;
            if (nonzero) {
              const adjustmentOperationId = randomUUID();
              const shortage = parseExactDecimal(difference).isPositive();
              await transaction
                .insertInto('inventory_operation')
                .values({
                  id: adjustmentOperationId,
                  operation_type: shortage ? 'NEGATIVE_ADJUSTMENT' : 'POSITIVE_ADJUSTMENT',
                  actor_id: context.actorId,
                  reason: request.differenceReason!,
                  related_entity_type: 'ROUTE_RECONCILIATION',
                  related_entity_id: reconciliationId,
                  idempotency_request_id: null,
                  reverses_operation_id: null,
                })
                .execute();
              const movement = await inventory.applyMovement({
                operationId: adjustmentOperationId,
                productId: loadLine.product_id,
                sourceId: shortage ? route.routeStockId : null,
                destinationId: shortage ? null : route.routeStockId,
                quantity: canonicalDecimal(parseExactDecimal(difference).abs(), 3),
                actorId: context.actorId,
                reason: request.differenceReason!,
                relatedEntityType: 'ROUTE_RECONCILIATION',
                relatedEntityId: reconciliationId,
              });
              adjustmentMovementId = movement.id;
            }
            if (parseExactDecimal(physical).isPositive())
              await inventory.applyMovement({
                operationId: returnOperationId,
                productId: loadLine.product_id,
                sourceId: route.routeStockId,
                destinationId: originStockId,
                quantity: physical,
                actorId: context.actorId,
                reason: 'Approved route reconciliation',
                relatedEntityType: 'ROUTE_RECONCILIATION',
                relatedEntityId: reconciliationId,
              });
            records.push({
              productId: loadLine.product_id,
              loaded: loadLine.quantity,
              sold,
              expected,
              physical,
              difference,
              reason: request.differenceReason?.trim() ?? null,
              adjustmentMovementId,
              productName: loadLine.product_name,
              unitCode: loadLine.unit_code,
            });
          }
          const nonzeroBalance = await transaction
            .selectFrom('inventory_balance')
            .select('id')
            .where('stock_location_id', '=', route.routeStockId)
            .where('quantity', '!=', '0')
            .executeTakeFirst();
          if (nonzeroBalance)
            throw Object.assign(new Error('Route inventory did not reconcile to zero'), {
              code: 'ROUTE_BALANCE_NONZERO',
            });
          const reconciliation = await transaction
            .insertInto('route_reconciliation')
            .values({
              id: reconciliationId,
              route_id: routeId,
              state: 'APPROVED',
              recorded_by: context.actorId,
              approved_by: context.actorId,
              approved_at: new Date(),
              return_operation_id: returnOperationId,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await transaction
            .insertInto('route_reconciliation_line')
            .values(
              records.map((record) => ({
                route_reconciliation_id: reconciliationId,
                product_id: record.productId,
                loaded_quantity: record.loaded,
                sold_quantity: record.sold,
                expected_return_quantity: record.expected,
                physical_return_quantity: record.physical,
                difference_quantity: record.difference,
                difference_reason: record.reason,
                adjustment_movement_id: record.adjustmentMovementId,
                product_name: record.productName,
                unit_code: record.unitCode,
              })),
            )
            .execute();
          await new AuditWriter().write(transaction, {
            actorId: context.actorId,
            action: 'ROUTE_CHANGED',
            entityType: 'ROUTE_RECONCILIATION',
            entityId: reconciliationId,
            after: { state: 'APPROVED', lineCount: records.length },
            operationId: returnOperationId,
            requestId: context.requestId,
          });
          return reconciliation;
        },
      );
    });
  }
  close(routeId: string, expectedVersion: number, context: RouteCommandContext) {
    return this.database.transaction().execute(async (transaction) => {
      return runRouteCommand(
        transaction,
        {
          operationType: 'ROUTE_CLOSE',
          resourceType: 'ROUTE',
          request: { routeId, expectedVersion },
          context,
        },
        async () => {
          const route = await transaction
            .selectFrom('route')
            .selectAll()
            .where('id', '=', routeId)
            .forUpdate()
            .executeTakeFirst();
          if (!route || route.state !== 'RETURNED')
            throw Object.assign(new Error('Only Returned routes can close'), {
              code: 'ROUTE_NOT_RETURNED',
            });
          const reconciliation = await transaction
            .selectFrom('route_reconciliation')
            .select('state')
            .where('route_id', '=', routeId)
            .executeTakeFirst();
          if (reconciliation?.state !== 'APPROVED')
            throw Object.assign(new Error('Approved reconciliation is required'), {
              code: 'RECONCILIATION_NOT_APPROVED',
            });
          const updated = await transaction
            .updateTable('route')
            .set({
              state: 'CLOSED',
              closed_at: new Date(),
              closed_by: context.actorId,
              version: expectedVersion + 1,
            })
            .where('id', '=', routeId)
            .where('version', '=', expectedVersion)
            .where('state', '=', 'RETURNED')
            .returningAll()
            .executeTakeFirst();
          if (!updated)
            throw Object.assign(new Error('Route changed concurrently'), {
              code: 'OPTIMISTIC_CONFLICT',
            });
          await new AuditWriter().write(transaction, {
            actorId: context.actorId,
            action: 'ROUTE_CHANGED',
            entityType: 'ROUTE',
            entityId: routeId,
            before: { state: 'RETURNED' },
            after: { state: 'CLOSED' },
            requestId: context.requestId,
          });
          return updated;
        },
      );
    });
  }
}

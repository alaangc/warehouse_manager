import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../../db/database.js';
import type { JsonValue } from '../../db/types.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency-repository.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';
import { InventoryRepository } from '../inventory/inventory-repository.js';
import { PricingService } from './pricing-service.js';

export interface SaleCommand {
  clientOperationId: string;
  customerId: string;
  routeId: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD';
  lines: { productId: string; quantity: string }[];
}
export interface SaleContext {
  actorId: string;
  idempotencyKey: string;
  requestId: string;
}

export class SaleService {
  constructor(private readonly database: AppDatabase) {}

  confirm(command: SaleCommand, context: SaleContext) {
    return runSerializable(this.database, async (transaction) => {
      const idempotency = new IdempotencyRepository();
      const acquired = await idempotency.acquire(transaction, {
        actorId: context.actorId,
        operationType: 'SALE_CONFIRMATION',
        key: context.idempotencyKey,
        requestHash: canonicalRequestHash(command as unknown as JsonValue),
      });
      if (acquired.kind === 'replay') return acquired.body;
      if (acquired.kind === 'hash_conflict')
        throw Object.assign(new Error('Idempotency key content differs'), {
          code: 'IDEMPOTENCY_HASH_CONFLICT',
        });
      if (acquired.kind === 'in_progress')
        throw Object.assign(new Error('Sale is already processing'), {
          code: 'IDEMPOTENCY_IN_PROGRESS',
        });

      const route = await transaction
        .selectFrom('route')
        .innerJoin('stock_location', 'stock_location.route_id', 'route.id')
        .select([
          'route.id',
          'route.state',
          'route.driver_id',
          'route.origin_location_id',
          'stock_location.id as stockLocationId',
        ])
        .where('route.id', '=', command.routeId)
        .forUpdate('route')
        .executeTakeFirst();
      if (!route || route.state !== 'EN_ROUTE')
        throw Object.assign(new Error('Route is not En Route'), { code: 'ROUTE_NOT_EN_ROUTE' });
      if (route.driver_id !== context.actorId)
        throw Object.assign(new Error('Driver is not assigned to the route'), {
          code: 'ROUTE_FORBIDDEN',
        });
      const quote = await new PricingService(transaction).price(
        command.customerId,
        command.routeId,
        command.lines,
      );
      if (quote.lines.some((line) => !line.available))
        throw Object.assign(new Error('One or more products are unavailable'), {
          code: 'INSUFFICIENT_INVENTORY',
        });

      const saleId = randomUUID();
      const inventoryOperationId = randomUUID();
      const saleNumber = `S-${Date.now()}-${saleId.slice(0, 8).toUpperCase()}`;
      const ticketNumber = `T-${saleNumber.slice(2)}`;
      await transaction
        .insertInto('inventory_operation')
        .values({
          id: inventoryOperationId,
          operation_type: 'SALE',
          actor_id: context.actorId,
          reason: null,
          related_entity_type: 'SALE',
          related_entity_id: saleId,
          idempotency_request_id: null,
          reverses_operation_id: null,
        })
        .execute();
      const inventory = new InventoryRepository(transaction);
      for (const line of [...quote.lines].sort((left, right) =>
        left.productId.localeCompare(right.productId),
      )) {
        await inventory.applyMovement({
          operationId: inventoryOperationId,
          productId: line.productId,
          sourceId: route.stockLocationId,
          destinationId: null,
          quantity: line.quantity,
          actorId: context.actorId,
          reason: null,
          relatedEntityType: 'SALE',
          relatedEntityId: saleId,
        });
      }
      await transaction
        .insertInto('sale')
        .values({
          id: saleId,
          sale_number: saleNumber,
          client_operation_id: command.clientOperationId,
          status: 'COMPLETED',
          customer_id: command.customerId,
          driver_id: context.actorId,
          route_id: command.routeId,
          origin_location_id: route.origin_location_id,
          payment_method: command.paymentMethod,
          currency_code: quote.currencyCode,
          subtotal: quote.total,
          total: quote.total,
          rounding_mode: 'HALF_AWAY_FROM_ZERO',
          inventory_operation_id: inventoryOperationId,
          idempotency_request_id: acquired.id,
          cancelled_at: null,
          cancelled_by: null,
          cancellation_reason: null,
        })
        .execute();
      await transaction
        .insertInto('sale_line')
        .values(
          quote.lines.map((line, index) => ({
            sale_id: saleId,
            sequence: index + 1,
            product_id: line.productId,
            customer_price_id: line.customerPriceId,
            product_name: line.productName,
            category_name: line.categoryName,
            reporting_group: line.reportingGroup,
            unit_code: line.unitCode,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            line_amount: line.lineAmount,
            applied_price_source: line.appliedPriceSource,
          })),
        )
        .execute();
      const ticketSnapshot = {
        saleNumber,
        ticketNumber,
        customerId: command.customerId,
        driverId: context.actorId,
        routeId: command.routeId,
        paymentMethod: command.paymentMethod,
        currencyCode: quote.currencyCode,
        lines: quote.lines.map((line) => ({
          productId: line.productId,
          productName: line.productName,
          categoryName: line.categoryName,
          reportingGroup: line.reportingGroup,
          unitCode: line.unitCode,
          quantity: line.quantity,
          appliedPriceSource: line.appliedPriceSource,
          unitPrice: line.unitPrice,
          lineAmount: line.lineAmount,
        })),
        total: quote.total,
      } as unknown as JsonValue;
      await transaction
        .insertInto('sale_ticket')
        .values({
          ticket_number: ticketNumber,
          sale_id: saleId,
          printable_snapshot: ticketSnapshot,
          content_version: '1',
        })
        .execute();
      await new AuditWriter().write(transaction, {
        actorId: context.actorId,
        action: 'SALE_CONFIRMED',
        entityType: 'SALE',
        entityId: saleId,
        after: { saleNumber, total: quote.total, routeId: command.routeId },
        operationId: inventoryOperationId,
        requestId: context.requestId,
      });
      const result = {
        id: saleId,
        saleNumber,
        clientOperationId: command.clientOperationId,
        status: 'COMPLETED',
        customerId: command.customerId,
        driverId: context.actorId,
        routeId: command.routeId,
        originLocationId: route.origin_location_id,
        paymentMethod: command.paymentMethod,
        currencyCode: quote.currencyCode,
        subtotal: quote.total,
        total: quote.total,
        roundingMode: 'HALF_AWAY_FROM_ZERO',
        lines: quote.lines,
        ticketNumber,
        completedAt: new Date().toISOString(),
        cancelledAt: null,
        cancelledBy: null,
        cancellationReason: null,
      };
      await idempotency.complete(transaction, acquired.id, {
        resourceType: 'SALE',
        resourceId: saleId,
        status: 201,
        body: result as unknown as JsonValue,
      });
      return result;
    });
  }
}

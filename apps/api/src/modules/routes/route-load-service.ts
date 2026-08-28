import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { parseQuantity } from '../../shared/quantity.js';
import { InventoryRepository } from '../inventory/inventory-repository.js';
import { assertAssignedDriver, assertLoadPreconditions } from './route-domain.js';
import { runRouteCommand, type RouteCommandContext } from './route-command.js';

export interface RouteContext {
  actorId: string;
  requestId: string;
}
export class RouteLoadService {
  constructor(private readonly database: AppDatabase) {}
  create(
    input: {
      routeNumber?: string | undefined;
      originLocationId: string;
      driverId: string;
      vehicleId: string;
      businessDate: string;
    },
    context: RouteContext,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const [location, driver, vehicle] = await Promise.all([
        transaction
          .selectFrom('location')
          .select('id')
          .where('id', '=', input.originLocationId)
          .where('active', '=', true)
          .executeTakeFirst(),
        transaction
          .selectFrom('app_user')
          .select('id')
          .where('id', '=', input.driverId)
          .where('role', '=', 'DRIVER')
          .where('active', '=', true)
          .executeTakeFirst(),
        transaction
          .selectFrom('vehicle')
          .select('id')
          .where('id', '=', input.vehicleId)
          .where('active', '=', true)
          .executeTakeFirst(),
      ]);
      if (!location || !driver || !vehicle)
        throw Object.assign(new Error('Route assignment contains inactive references'), {
          code: 'ROUTE_ASSIGNMENT_INVALID',
        });
      const route = await transaction
        .insertInto('route')
        .values({
          route_number:
            input.routeNumber ??
            `R-${input.businessDate.replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
          state: 'PREPARING',
          origin_location_id: input.originLocationId,
          driver_id: input.driverId,
          vehicle_id: input.vehicleId,
          business_date: input.businessDate,
          created_by: context.actorId,
          started_at: null,
          returned_at: null,
          closed_at: null,
          closed_by: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await transaction
        .insertInto('stock_location')
        .values({ kind: 'ROUTE', branch_id: null, route_id: route.id })
        .execute();
      await new AuditWriter().write(transaction, {
        actorId: context.actorId,
        action: 'ROUTE_CHANGED',
        entityType: 'ROUTE',
        entityId: route.id,
        after: { state: 'PREPARING', driverId: route.driver_id, vehicleId: route.vehicle_id },
        requestId: context.requestId,
      });
      return route;
    });
  }
  saveDraft(
    routeId: string,
    expectedVersion: number,
    lines: { productId: string; quantity: string }[],
    context: RouteContext,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const route = await transaction
        .selectFrom('route')
        .selectAll()
        .where('id', '=', routeId)
        .forUpdate()
        .executeTakeFirst();
      if (!route) throw Object.assign(new Error('Route not found'), { code: 'RESOURCE_NOT_FOUND' });
      assertAssignedDriver(context.actorId, route.driver_id);
      let load = await transaction
        .selectFrom('route_load')
        .selectAll()
        .where('route_id', '=', routeId)
        .executeTakeFirst();
      assertLoadPreconditions(route.state, load?.state ?? null, 'EDIT');
      if (!load)
        load = await transaction
          .insertInto('route_load')
          .values({
            route_id: routeId,
            state: 'DRAFT',
            recorded_by: context.actorId,
            confirmed_at: null,
            inventory_operation_id: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      else if (load.version !== expectedVersion)
        throw Object.assign(new Error('Route load changed concurrently'), {
          code: 'OPTIMISTIC_CONFLICT',
        });
      await transaction
        .deleteFrom('route_load_line')
        .where('route_load_id', '=', load.id)
        .execute();
      const products = await transaction
        .selectFrom('product')
        .innerJoin('unit', 'unit.id', 'product.unit_id')
        .select(['product.id', 'product.name', 'unit.code', 'unit.quantity_scale'])
        .where(
          'product.id',
          'in',
          lines.map((line) => line.productId),
        )
        .where('product.active', '=', true)
        .execute();
      if (products.length !== new Set(lines.map((line) => line.productId)).size)
        throw Object.assign(new Error('Load contains unavailable products'), {
          code: 'PRODUCT_UNAVAILABLE',
        });
      const byProduct = new Map(products.map((product) => [product.id, product]));
      await transaction
        .insertInto('route_load_line')
        .values(
          lines.map((line) => {
            const product = byProduct.get(line.productId)!;
            return {
              route_load_id: load.id,
              product_id: line.productId,
              quantity: parseQuantity(line.quantity, product.quantity_scale),
              product_name: product.name,
              unit_code: product.code,
              quantity_scale: product.quantity_scale,
            };
          }),
        )
        .execute();
      return transaction
        .updateTable('route_load')
        .set({ updated_at: new Date(), version: load.version + 1 })
        .where('id', '=', load.id)
        .where('version', '=', load.version)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }
  confirm(routeId: string, expectedVersion: number, context: RouteCommandContext) {
    return runSerializable(this.database, async (transaction) => {
      return runRouteCommand(
        transaction,
        {
          operationType: 'ROUTE_LOAD_CONFIRM',
          resourceType: 'ROUTE_LOAD',
          request: { routeId, expectedVersion },
          context,
        },
        async (idempotencyRequestId) => {
          const route = await transaction
            .selectFrom('route')
            .innerJoin('stock_location as route_stock', 'route_stock.route_id', 'route.id')
            .select([
              'route.id',
              'route.state',
              'route.driver_id',
              'route.origin_location_id',
              'route_stock.id as routeStockId',
            ])
            .where('route.id', '=', routeId)
            .forUpdate('route')
            .executeTakeFirst();
          if (!route)
            throw Object.assign(new Error('Route not found'), { code: 'RESOURCE_NOT_FOUND' });
          assertAssignedDriver(context.actorId, route.driver_id);
          const load = await transaction
            .selectFrom('route_load')
            .selectAll()
            .where('route_id', '=', routeId)
            .forUpdate()
            .executeTakeFirst();
          assertLoadPreconditions(route.state, load?.state ?? null, 'CONFIRM');
          if (!load) throw new Error('Unreachable: load preconditions require a draft load');
          if (load.version !== expectedVersion)
            throw Object.assign(new Error('Route load changed concurrently'), {
              code: 'OPTIMISTIC_CONFLICT',
            });
          const lines = await transaction
            .selectFrom('route_load_line')
            .selectAll()
            .where('route_load_id', '=', load.id)
            .orderBy('product_id')
            .execute();
          if (!lines.length)
            throw Object.assign(new Error('Load cannot be empty'), { code: 'LOAD_EMPTY' });
          const inventory = new InventoryRepository(transaction);
          const originStockId = await inventory.branchStockLocation(route.origin_location_id);
          const operationId = randomUUID();
          await transaction
            .insertInto('inventory_operation')
            .values({
              id: operationId,
              operation_type: 'ROUTE_LOAD',
              actor_id: context.actorId,
              reason: null,
              related_entity_type: 'ROUTE_LOAD',
              related_entity_id: load.id,
              idempotency_request_id: idempotencyRequestId,
              reverses_operation_id: null,
            })
            .execute();
          for (const line of lines)
            await inventory.applyMovement({
              operationId,
              productId: line.product_id,
              sourceId: originStockId,
              destinationId: route.routeStockId,
              quantity: line.quantity,
              actorId: context.actorId,
              reason: null,
              relatedEntityType: 'ROUTE_LOAD',
              relatedEntityId: load.id,
            });
          const confirmed = await transaction
            .updateTable('route_load')
            .set({
              state: 'CONFIRMED',
              confirmed_at: new Date(),
              inventory_operation_id: operationId,
              updated_at: new Date(),
              version: load.version + 1,
            })
            .where('id', '=', load.id)
            .where('state', '=', 'DRAFT')
            .where('version', '=', expectedVersion)
            .returningAll()
            .executeTakeFirstOrThrow();
          await new AuditWriter().write(transaction, {
            actorId: context.actorId,
            action: 'ROUTE_CHANGED',
            entityType: 'ROUTE_LOAD',
            entityId: load.id,
            after: { state: 'CONFIRMED', lineCount: lines.length },
            operationId,
            requestId: context.requestId,
          });
          return confirmed;
        },
      );
    });
  }
}

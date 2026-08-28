import {
  RouteCreateSchema,
  RouteLoadDraftSchema,
  RouteReconciliationSchema,
  RouteTransitionSchema,
} from '@warehouse/contracts';
import { Router, type Request } from 'express';
import { requireAuthenticated, requireRole } from '../../auth/authorization.js';
import type { AppDatabase } from '../../db/database.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { RouteLoadService } from './route-load-service.js';
import { getRouteProjection } from './route-projection.js';
import { RouteReconciliationService } from './route-reconciliation-service.js';
import { RouteRepository, toRouteResource } from './route-repository.js';
import { RouteTransitionService } from './route-transition-service.js';

function pathId(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new HttpProblem(422, 'ID_INVALID', 'Validation Failed');
  return value;
}
function requestId(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : 'unknown';
}
function idempotencyKey(request: Request): string {
  const value = request.header('Idempotency-Key');
  if (!value || value.length < 16 || value.length > 128)
    throw new HttpProblem(422, 'IDEMPOTENCY_KEY_INVALID', 'Validation Failed');
  return value;
}
function stockReference(
  id: string | null,
  kind: 'BRANCH' | 'ROUTE' | null,
  branchId: string | null,
  routeId: string | null,
) {
  return id && kind
    ? { id, kind, label: kind === 'BRANCH' ? 'Branch' : 'Route', branchId, routeId }
    : null;
}
function mapRouteError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === 'RESOURCE_NOT_FOUND') throw new HttpProblem(404, code, 'Not Found');
    if (code === 'ROUTE_FORBIDDEN') throw new HttpProblem(403, code, 'Forbidden');
    if (
      [
        'PRODUCT_UNAVAILABLE',
        'ROUTE_ASSIGNMENT_INVALID',
        'RECONCILIATION_LINES_INVALID',
        'DIFFERENCE_REASON_REQUIRED',
        'UNEXPECTED_DIFFERENCE_REASON',
        'RECONCILIATION_QUANTITY_INVALID',
      ].includes(code)
    )
      throw new HttpProblem(
        422,
        code,
        'Validation Failed',
        error instanceof Error ? error.message : undefined,
      );
    throw new HttpProblem(
      409,
      code,
      'Conflict',
      error instanceof Error ? error.message : undefined,
    );
  }
  throw error;
}

export function createRouteRouter(database: AppDatabase): Router {
  const router = Router();
  const loads = new RouteLoadService(database);
  const transitions = new RouteTransitionService(database);
  const reconciliation = new RouteReconciliationService(database);
  router.use(requireAuthenticated);
  router.get('/routes', async (request, response, next) => {
    try {
      const data = await database
        .transaction()
        .execute((transaction) => new RouteRepository(transaction).list(request.principal!));
      response.json({ data, page: { hasNextPage: false, nextCursor: null } });
    } catch (error) {
      try {
        mapRouteError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.post('/routes', requireRole('ADMINISTRATOR'), async (request, response, next) => {
    try {
      const input = RouteCreateSchema.parse(request.body);
      response.status(201).json({
        data: toRouteResource(
          await loads.create(input, {
            actorId: request.principal!.id,
            requestId: requestId(request),
          }),
        ),
      });
    } catch (error) {
      try {
        mapRouteError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.get('/routes/:routeId', async (request, response, next) => {
    try {
      const id = pathId(request.params.routeId);
      const route = await database
        .transaction()
        .execute((transaction) => new RouteRepository(transaction).detail(id, request.principal!));
      if (!route) throw new HttpProblem(404, 'ROUTE_NOT_FOUND', 'Not Found');
      const [load, balances, movements, sales, approved] = await Promise.all([
        database.selectFrom('route_load').selectAll().where('route_id', '=', id).executeTakeFirst(),
        database
          .selectFrom('inventory_balance')
          .innerJoin('stock_location', 'stock_location.id', 'inventory_balance.stock_location_id')
          .innerJoin('product', 'product.id', 'inventory_balance.product_id')
          .select([
            'inventory_balance.id',
            'inventory_balance.product_id as productId',
            'product.name as productName',
            'inventory_balance.quantity',
            'inventory_balance.version',
            'inventory_balance.updated_at as updatedAt',
            'stock_location.id as stockLocationId',
            'stock_location.kind',
            'stock_location.branch_id as branchId',
            'stock_location.route_id as routeId',
            'product.low_stock_threshold as threshold',
          ])
          .where('stock_location.route_id', '=', id)
          .execute(),
        database
          .selectFrom('inventory_movement')
          .innerJoin(
            'inventory_operation',
            'inventory_operation.id',
            'inventory_movement.operation_id',
          )
          .leftJoin(
            'stock_location as movement_source',
            'movement_source.id',
            'inventory_movement.source_stock_location_id',
          )
          .leftJoin(
            'stock_location as movement_destination',
            'movement_destination.id',
            'inventory_movement.destination_stock_location_id',
          )
          .selectAll('inventory_movement')
          .select([
            'inventory_operation.operation_type as operationType',
            'movement_source.id as sourceId',
            'movement_source.kind as sourceKind',
            'movement_source.branch_id as sourceBranchId',
            'movement_source.route_id as sourceRouteId',
            'movement_destination.id as destinationId',
            'movement_destination.kind as destinationKind',
            'movement_destination.branch_id as destinationBranchId',
            'movement_destination.route_id as destinationRouteId',
          ])
          .where((expression) =>
            expression.or([
              expression(
                'inventory_movement.source_stock_location_id',
                '=',
                database.selectFrom('stock_location').select('id').where('route_id', '=', id),
              ),
              expression(
                'inventory_movement.destination_stock_location_id',
                '=',
                database.selectFrom('stock_location').select('id').where('route_id', '=', id),
              ),
            ]),
          )
          .orderBy('inventory_movement.occurred_at')
          .execute(),
        database
          .selectFrom('sale')
          .selectAll()
          .where('route_id', '=', id)
          .orderBy('completed_at')
          .execute(),
        database
          .selectFrom('route_reconciliation')
          .selectAll()
          .where('route_id', '=', id)
          .executeTakeFirst(),
      ]);
      response.json({
        data: {
          route,
          load: load
            ? {
                id: load.id,
                routeId: load.route_id,
                state: load.state,
                recordedBy: load.recorded_by,
                confirmedAt: load.confirmed_at ? new Date(load.confirmed_at).toISOString() : null,
                lines: await database
                  .selectFrom('route_load_line')
                  .select(['product_id as productId', 'quantity'])
                  .where('route_load_id', '=', load.id)
                  .orderBy('product_id')
                  .execute(),
                version: load.version,
              }
            : null,
          balances: balances.map(
            ({ stockLocationId, kind, branchId, routeId, threshold, ...balance }) => ({
              ...balance,
              quantity: Number(balance.quantity).toFixed(3),
              updatedAt: new Date(balance.updatedAt).toISOString(),
              lowStockAlert: Number(balance.quantity) <= Number(threshold),
              stockLocation: {
                id: stockLocationId,
                kind,
                label: kind === 'ROUTE' ? `Route ${route.routeNumber}` : 'Branch',
                branchId,
                routeId,
              },
            }),
          ),
          movements: movements.map((movement) => ({
            id: movement.id,
            operationId: movement.operation_id,
            operationType: movement.operationType,
            productId: movement.product_id,
            source: stockReference(
              movement.sourceId,
              movement.sourceKind,
              movement.sourceBranchId,
              movement.sourceRouteId,
            ),
            destination: stockReference(
              movement.destinationId,
              movement.destinationKind,
              movement.destinationBranchId,
              movement.destinationRouteId,
            ),
            quantity: movement.quantity,
            sourceBalanceAfter: movement.source_balance_after,
            destinationBalanceAfter: movement.destination_balance_after,
            actorId: movement.actor_id,
            reason: movement.reason,
            occurredAt: new Date(movement.occurred_at).toISOString(),
            relatedEntityType: movement.related_entity_type,
            relatedEntityId: movement.related_entity_id,
          })),
          sales: sales.map((sale) => ({
            id: sale.id,
            saleNumber: sale.sale_number,
            status: sale.status,
            customerId: sale.customer_id,
            driverId: sale.driver_id,
            routeId: sale.route_id,
            paymentMethod: sale.payment_method,
            total: sale.total,
            completedAt: new Date(sale.completed_at).toISOString(),
            cancelledAt: sale.cancelled_at ? new Date(sale.cancelled_at).toISOString() : null,
          })),
          reconciliation: approved
            ? {
                id: approved.id,
                routeId: approved.route_id,
                state: approved.state,
                recordedBy: approved.recorded_by,
                approvedBy: approved.approved_by,
                approvedAt: approved.approved_at
                  ? new Date(approved.approved_at).toISOString()
                  : null,
                lines: await database
                  .selectFrom('route_reconciliation_line')
                  .select([
                    'product_id as productId',
                    'loaded_quantity as loadedQuantity',
                    'sold_quantity as soldQuantity',
                    'expected_return_quantity as expectedReturnQuantity',
                    'physical_return_quantity as physicalReturnQuantity',
                    'difference_quantity as differenceQuantity',
                    'difference_reason as differenceReason',
                  ])
                  .where('route_reconciliation_id', '=', approved.id)
                  .orderBy('product_id')
                  .execute(),
                version: approved.version,
              }
            : null,
        },
      });
    } catch (error) {
      try {
        mapRouteError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.put('/routes/:routeId/load', requireRole('DRIVER'), async (request, response, next) => {
    try {
      const input = RouteLoadDraftSchema.parse(request.body);
      const routeId = pathId(request.params.routeId);
      await loads.saveDraft(routeId, input.expectedVersion, input.lines, {
        actorId: request.principal!.id,
        requestId: requestId(request),
      });
      const projection = await getRouteProjection(database, routeId, request.principal!);
      response.json({
        data: projection.load,
      });
    } catch (error) {
      try {
        mapRouteError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.post(
    '/routes/:routeId/load/confirmation',
    requireRole('DRIVER'),
    async (request, response, next) => {
      try {
        const input = RouteTransitionSchema.parse(request.body);
        const routeId = pathId(request.params.routeId);
        await loads.confirm(routeId, input.expectedVersion, {
          actorId: request.principal!.id,
          idempotencyKey: idempotencyKey(request),
          requestId: requestId(request),
        });
        response.json({
          data: await getRouteProjection(database, routeId, request.principal!),
        });
      } catch (error) {
        try {
          mapRouteError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  router.post('/routes/:routeId/start', requireRole('DRIVER'), async (request, response, next) => {
    try {
      const input = RouteTransitionSchema.parse(request.body);
      response.json({
        data: toRouteResource(
          await transitions.transition(
            pathId(request.params.routeId),
            'START',
            input.expectedVersion,
            {
              actorId: request.principal!.id,
              idempotencyKey: idempotencyKey(request),
              requestId: requestId(request),
            },
          ),
        ),
      });
    } catch (error) {
      try {
        mapRouteError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.post('/routes/:routeId/return', requireRole('DRIVER'), async (request, response, next) => {
    try {
      const input = RouteTransitionSchema.parse(request.body);
      response.json({
        data: toRouteResource(
          await transitions.transition(
            pathId(request.params.routeId),
            'RETURN',
            input.expectedVersion,
            {
              actorId: request.principal!.id,
              idempotencyKey: idempotencyKey(request),
              requestId: requestId(request),
            },
          ),
        ),
      });
    } catch (error) {
      try {
        mapRouteError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.put(
    '/routes/:routeId/reconciliation',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = RouteReconciliationSchema.parse(request.body);
        const routeId = pathId(request.params.routeId);
        await reconciliation.approve(routeId, input, {
          actorId: request.principal!.id,
          idempotencyKey: idempotencyKey(request),
          requestId: requestId(request),
        });
        const projection = await getRouteProjection(database, routeId, request.principal!);
        response.json({
          data: projection.reconciliation,
        });
      } catch (error) {
        try {
          mapRouteError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  router.post(
    '/routes/:routeId/close',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = RouteTransitionSchema.parse(request.body);
        response.json({
          data: toRouteResource(
            await reconciliation.close(pathId(request.params.routeId), input.expectedVersion, {
              actorId: request.principal!.id,
              idempotencyKey: idempotencyKey(request),
              requestId: requestId(request),
            }),
          ),
        });
      } catch (error) {
        try {
          mapRouteError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  return router;
}

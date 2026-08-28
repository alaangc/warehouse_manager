import type { AppDatabase } from '../../db/database.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { RouteRepository } from './route-repository.js';

type Principal = { id: string; role: 'ADMINISTRATOR' | 'DRIVER' };

function stockLocation(
  id: string | null,
  kind: 'BRANCH' | 'ROUTE' | null,
  branchId: string | null,
  routeId: string | null,
) {
  return id && kind
    ? { id, kind, label: kind === 'BRANCH' ? 'Branch' : 'Route', branchId, routeId }
    : null;
}

export async function getRouteProjection(database: AppDatabase, id: string, principal: Principal) {
  const route = await database
    .transaction()
    .execute((transaction) => new RouteRepository(transaction).detail(id, principal));
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
      .selectFrom('inventory_movement as movement')
      .innerJoin('inventory_operation as operation', 'operation.id', 'movement.operation_id')
      .leftJoin('stock_location as source', 'source.id', 'movement.source_stock_location_id')
      .leftJoin(
        'stock_location as destination',
        'destination.id',
        'movement.destination_stock_location_id',
      )
      .select([
        'movement.id',
        'movement.operation_id as operationId',
        'operation.operation_type as operationType',
        'movement.product_id as productId',
        'movement.quantity',
        'movement.source_balance_after as sourceBalanceAfter',
        'movement.destination_balance_after as destinationBalanceAfter',
        'movement.actor_id as actorId',
        'movement.reason',
        'movement.occurred_at as occurredAt',
        'movement.related_entity_type as relatedEntityType',
        'movement.related_entity_id as relatedEntityId',
        'source.id as sourceId',
        'source.kind as sourceKind',
        'source.branch_id as sourceBranchId',
        'source.route_id as sourceRouteId',
        'destination.id as destinationId',
        'destination.kind as destinationKind',
        'destination.branch_id as destinationBranchId',
        'destination.route_id as destinationRouteId',
      ])
      .where((expression) =>
        expression.or([
          expression(
            'movement.source_stock_location_id',
            '=',
            database.selectFrom('stock_location').select('id').where('route_id', '=', id),
          ),
          expression(
            'movement.destination_stock_location_id',
            '=',
            database.selectFrom('stock_location').select('id').where('route_id', '=', id),
          ),
        ]),
      )
      .orderBy('movement.occurred_at')
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
  const loadLines = load
    ? await database
        .selectFrom('route_load_line')
        .select(['product_id as productId', 'quantity'])
        .where('route_load_id', '=', load.id)
        .orderBy('product_id')
        .execute()
    : [];
  const reconciliationLines = approved
    ? await database
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
        .execute()
    : [];
  return {
    route,
    load: load
      ? {
          id: load.id,
          routeId: load.route_id,
          state: load.state,
          recordedBy: load.recorded_by,
          confirmedAt: load.confirmed_at ? new Date(load.confirmed_at).toISOString() : null,
          lines: loadLines,
          version: load.version,
        }
      : null,
    balances: balances.map(
      ({ stockLocationId, kind, branchId, routeId, threshold, ...balance }) => ({
        ...balance,
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
    movements: movements.map(
      ({
        sourceId,
        sourceKind,
        sourceBranchId,
        sourceRouteId,
        destinationId,
        destinationKind,
        destinationBranchId,
        destinationRouteId,
        occurredAt,
        ...movement
      }) => ({
        ...movement,
        source: stockLocation(sourceId, sourceKind, sourceBranchId, sourceRouteId),
        destination: stockLocation(
          destinationId,
          destinationKind,
          destinationBranchId,
          destinationRouteId,
        ),
        occurredAt: new Date(occurredAt).toISOString(),
      }),
    ),
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
          approvedAt: approved.approved_at ? new Date(approved.approved_at).toISOString() : null,
          lines: reconciliationLines,
          version: approved.version,
        }
      : null,
  };
}

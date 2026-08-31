import { Router } from 'express';
import { sql } from 'kysely';
import type { AppDatabase } from '../../db/database.js';
import type { InventoryOperationType } from '../../db/types.js';
import { requireAuthenticated, requireRole } from '../../auth/authorization.js';
import { HttpProblem } from '../../http/problem-handler.js';
import {
  InventoryOperationRequestSchema,
  InventoryTransferRequestSchema,
  ReversalRequestSchema,
  UuidSchema,
} from '@warehouse/contracts';
import { InventoryService } from './inventory-service.js';

function key(request: Parameters<Parameters<Router['post']>[1]>[0]): string {
  const value = request.header('Idempotency-Key');
  if (!value || value.length < 16 || value.length > 128)
    throw new HttpProblem(
      422,
      'IDEMPOTENCY_KEY_INVALID',
      'Validation Failed',
      'A valid Idempotency-Key header is required.',
    );
  return value;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function movementUuid(value: unknown): string | undefined {
  const raw = queryString(value);
  if (!raw) return undefined;
  if (!UuidSchema.safeParse(raw).success)
    throw new HttpProblem(422, 'QUERY_UUID_INVALID', 'Validation Failed');
  return raw;
}

const movementOperationTypes = new Set<InventoryOperationType>([
  'ENTRY',
  'MANUAL_EXIT',
  'TRANSFER',
  'ROUTE_LOAD',
  'SALE',
  'ROUTE_RETURN',
  'POSITIVE_ADJUSTMENT',
  'NEGATIVE_ADJUSTMENT',
  'SALE_CANCELLATION',
]);

function movementOperationType(value: unknown): InventoryOperationType | undefined {
  const operationType = queryString(value);
  if (!operationType) return undefined;
  if (!movementOperationTypes.has(operationType as InventoryOperationType))
    throw new HttpProblem(422, 'OPERATION_TYPE_INVALID', 'Validation Failed');
  return operationType as InventoryOperationType;
}

function movementDate(value: unknown, name: string): Date | undefined {
  const raw = queryString(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()))
    throw new HttpProblem(422, `${name.toUpperCase()}_INVALID`, 'Validation Failed');
  return date;
}

function mapDomainError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === 'RESOURCE_NOT_FOUND' || code === 'STOCK_LOCATION_NOT_FOUND')
      throw new HttpProblem(404, code, 'Not Found');
    if (
      [
        'INSUFFICIENT_INVENTORY',
        'INVENTORY_CONFLICT',
        'IDEMPOTENCY_HASH_CONFLICT',
        'IDEMPOTENCY_IN_PROGRESS',
      ].includes(code)
    )
      throw new HttpProblem(
        409,
        code,
        'Conflict',
        error instanceof Error ? error.message : undefined,
      );
  }
  throw error;
}

export function createInventoryRouter(database: AppDatabase): Router {
  const router = Router();
  const service = new InventoryService(database);
  router.get('/inventory/balances', requireAuthenticated, async (request, response, next) => {
    try {
      let query = database
        .selectFrom('inventory_balance as balance')
        .innerJoin('product', 'product.id', 'balance.product_id')
        .innerJoin('stock_location as stock', 'stock.id', 'balance.stock_location_id')
        .select([
          'balance.id',
          'balance.product_id as productId',
          'product.name as productName',
          'balance.quantity',
          'balance.version',
          'balance.updated_at as updatedAt',
          'stock.id as stockLocationId',
          'stock.kind',
          'stock.branch_id as branchId',
          'stock.route_id as routeId',
          'product.low_stock_threshold as threshold',
        ])
        .orderBy('balance.updated_at desc')
        .limit(100);
      const productId = queryString(request.query.productId);
      const branchFilter = queryString(request.query.branchId);
      const routeFilter = queryString(request.query.routeId);
      if (productId) query = query.where('balance.product_id', '=', productId);
      if (branchFilter) query = query.where('stock.branch_id', '=', branchFilter);
      if (routeFilter) query = query.where('stock.route_id', '=', routeFilter);
      if (request.principal?.role === 'DRIVER') {
        query = query
          .innerJoin('route', 'route.id', 'stock.route_id')
          .where('route.driver_id', '=', request.principal.id);
      }
      const rows = await query.execute();
      const data = rows
        .filter(
          (row) =>
            request.query.alertsOnly !== 'true' || Number(row.quantity) <= Number(row.threshold),
        )
        .map(({ threshold, stockLocationId, kind, branchId, routeId, ...row }) => ({
          ...row,
          quantity: Number(row.quantity).toFixed(3),
          lowStockAlert: Number(row.quantity) <= Number(threshold),
          stockLocation: {
            id: stockLocationId,
            kind,
            label: kind === 'BRANCH' ? 'Branch' : 'Route',
            branchId,
            routeId,
          },
        }));
      response.json({ data, page: { hasNextPage: false, nextCursor: null } });
    } catch (error) {
      next(error);
    }
  });
  router.get('/inventory/movements', requireAuthenticated, async (request, response, next) => {
    try {
      let query = database
        .selectFrom('inventory_movement as movement')
        .innerJoin('inventory_operation as operation', 'operation.id', 'movement.operation_id')
        .selectAll('movement')
        .select('operation.operation_type as operationType')
        .orderBy('movement.occurred_at desc')
        .limit(100);
      const productId = movementUuid(request.query.productId);
      const branchFilter = movementUuid(request.query.branchId);
      const routeFilter = movementUuid(request.query.routeId);
      const operationType = movementOperationType(request.query.operationType);
      const from = movementDate(request.query.from, 'from');
      const to = movementDate(request.query.to, 'to');
      if (from && to && from > to)
        throw new HttpProblem(422, 'DATE_RANGE_INVALID', 'Validation Failed');
      if (productId) query = query.where('movement.product_id', '=', productId);
      if (branchFilter)
        query = query.where(sql<boolean>`exists (
          select 1 from stock_location filtered_stock
          where filtered_stock.branch_id = ${branchFilter}::uuid
          and filtered_stock.id in (
            movement.source_stock_location_id,
            movement.destination_stock_location_id
          )
        )`);
      if (routeFilter)
        query = query.where(sql<boolean>`exists (
          select 1 from stock_location filtered_stock
          where filtered_stock.route_id = ${routeFilter}::uuid
          and filtered_stock.id in (
            movement.source_stock_location_id,
            movement.destination_stock_location_id
          )
        )`);
      if (operationType) query = query.where('operation.operation_type', '=', operationType);
      if (from) query = query.where('movement.occurred_at', '>=', from);
      if (to) query = query.where('movement.occurred_at', '<', to);
      if (request.principal?.role === 'DRIVER') {
        if (!routeFilter) throw new HttpProblem(403, 'ROUTE_SCOPE_REQUIRED', 'Forbidden');
        query = query.where(sql<boolean>`exists (
          select 1 from stock_location scoped_stock join route scoped_route on scoped_route.id = scoped_stock.route_id
          where scoped_route.id = ${routeFilter}::uuid and scoped_route.driver_id = ${request.principal.id}::uuid
          and scoped_stock.id in (movement.source_stock_location_id, movement.destination_stock_location_id)
        )`);
      }
      const rows = await query.execute();
      const stockIds = [
        ...new Set(
          rows.flatMap((row) =>
            [row.source_stock_location_id, row.destination_stock_location_id].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        ),
      ];
      const stockRows = stockIds.length
        ? await database
            .selectFrom('stock_location as stock')
            .leftJoin('location as branch', 'branch.id', 'stock.branch_id')
            .leftJoin('route', 'route.id', 'stock.route_id')
            .select([
              'stock.id',
              'stock.kind',
              'stock.branch_id as branchId',
              'stock.route_id as routeId',
              'branch.name as branchName',
              'route.route_number as routeNumber',
            ])
            .where('stock.id', 'in', stockIds)
            .execute()
        : [];
      const stockById = new Map(
        stockRows.map((stock) => [
          stock.id,
          {
            id: stock.id,
            kind: stock.kind,
            label:
              stock.kind === 'BRANCH'
                ? (stock.branchName ?? 'Branch')
                : (stock.routeNumber ?? 'Route'),
            branchId: stock.branchId,
            routeId: stock.routeId,
          },
        ]),
      );
      response.json({
        data: rows.map((row) => ({
          id: row.id,
          operationId: row.operation_id,
          operationType: row.operationType,
          productId: row.product_id,
          source: row.source_stock_location_id
            ? (stockById.get(row.source_stock_location_id) ?? null)
            : null,
          destination: row.destination_stock_location_id
            ? (stockById.get(row.destination_stock_location_id) ?? null)
            : null,
          quantity: row.quantity,
          sourceBalanceAfter: row.source_balance_after,
          destinationBalanceAfter: row.destination_balance_after,
          actorId: row.actor_id,
          reason: row.reason,
          occurredAt: new Date(row.occurred_at).toISOString(),
          relatedEntityType: row.related_entity_type,
          relatedEntityId: row.related_entity_id,
          reversesMovementId: row.reverses_movement_id,
        })),
        page: { hasNextPage: false, nextCursor: null },
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/inventory/operations',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = InventoryOperationRequestSchema.parse(request.body);
        const result = await service.createBranchOperation(input, {
          actorId: request.principal!.id,
          idempotencyKey: key(request),
          requestId: request.id as string,
        });
        response.status(201).json({ data: result });
      } catch (error) {
        try {
          mapDomainError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  router.post(
    '/inventory/transfers',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = InventoryTransferRequestSchema.parse(request.body);
        const result = await service.createTransfer(input, {
          actorId: request.principal!.id,
          idempotencyKey: key(request),
          requestId: request.id as string,
        });
        response.status(201).json({ data: result });
      } catch (error) {
        try {
          mapDomainError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  router.post(
    '/inventory/operations/:operationId/reversal',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = ReversalRequestSchema.parse(request.body);
        const operationId = request.params.operationId;
        if (typeof operationId !== 'string')
          throw new HttpProblem(422, 'OPERATION_ID_INVALID', 'Validation Failed');
        const result = await service.reverse(operationId, input.reason, {
          actorId: request.principal!.id,
          idempotencyKey: key(request),
          requestId: request.id as string,
        });
        response.status(201).json({ data: result });
      } catch (error) {
        try {
          mapDomainError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  return router;
}

import {
  SaleCancellationRequestSchema,
  SaleCreateRequestSchema,
  SaleQuoteRequestSchema,
} from '@warehouse/contracts';
import { Router, type Request } from 'express';
import { requireAuthenticated, requireRole } from '../../auth/authorization.js';
import type { AppDatabase } from '../../db/database.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { CancellationService } from './cancellation-service.js';
import { PricingService } from './pricing-service.js';
import { SaleRepository } from './sale-repository.js';
import { SaleService } from './sale-service.js';

function requestId(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : 'unknown';
}
function idempotencyKey(request: Request): string {
  const key = request.header('Idempotency-Key');
  if (!key || key.length < 16 || key.length > 128)
    throw new HttpProblem(422, 'IDEMPOTENCY_KEY_INVALID', 'Validation Failed');
  return key;
}
function pathId(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new HttpProblem(422, 'ID_INVALID', 'Validation Failed');
  return value;
}
function mapSaleError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === 'RESOURCE_NOT_FOUND') throw new HttpProblem(404, code, 'Not Found');
    if (code === 'ROUTE_FORBIDDEN') throw new HttpProblem(403, code, 'Forbidden');
    if (['CUSTOMER_UNAVAILABLE', 'PRODUCT_UNAVAILABLE'].includes(code))
      throw new HttpProblem(422, code, 'Validation Failed');
    if (
      [
        'ROUTE_NOT_EN_ROUTE',
        'INSUFFICIENT_INVENTORY',
        'SALE_ALREADY_CANCELLED',
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

export function createSalesRouter(database: AppDatabase): Router {
  const router = Router();
  const sales = new SaleService(database);
  const cancellations = new CancellationService(database);
  router.use(requireAuthenticated);

  router.post('/sales/quote', requireRole('DRIVER'), async (request, response, next) => {
    try {
      const input = SaleQuoteRequestSchema.parse(request.body);
      const route = await database
        .selectFrom('route')
        .select(['driver_id', 'state'])
        .where('id', '=', input.routeId)
        .executeTakeFirst();
      if (!route || route.driver_id !== request.principal!.id)
        throw new HttpProblem(403, 'ROUTE_FORBIDDEN', 'Forbidden');
      const quote = await database
        .transaction()
        .execute((transaction) =>
          new PricingService(transaction).price(input.customerId, input.routeId, input.lines),
        );
      response.json({ data: quote });
    } catch (error) {
      try {
        mapSaleError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.post('/sales', requireRole('DRIVER'), async (request, response, next) => {
    try {
      const input = SaleCreateRequestSchema.parse(request.body);
      const result = await sales.confirm(input, {
        actorId: request.principal!.id,
        idempotencyKey: idempotencyKey(request),
        requestId: requestId(request),
      });
      response.status(201).json({ data: result });
    } catch (error) {
      try {
        mapSaleError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.get('/sales', async (request, response, next) => {
    try {
      const principal = request.principal!;
      const data = await database
        .transaction()
        .execute((transaction) => new SaleRepository(transaction).list(principal));
      response.json({ data, page: { hasNextPage: false, nextCursor: null } });
    } catch (error) {
      next(error);
    }
  });
  router.get('/sales/:saleId', async (request, response, next) => {
    try {
      const data = await database
        .transaction()
        .execute((transaction) =>
          new SaleRepository(transaction).detail(pathId(request.params.saleId), request.principal!),
        );
      if (!data) throw new HttpProblem(404, 'SALE_NOT_FOUND', 'Not Found');
      response.json({ data });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/sales/:saleId/cancellation',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = SaleCancellationRequestSchema.parse(request.body);
        const data = await cancellations.cancel(pathId(request.params.saleId), input.reason, {
          actorId: request.principal!.id,
          idempotencyKey: idempotencyKey(request),
          requestId: requestId(request),
        });
        response.json({ data });
      } catch (error) {
        try {
          mapSaleError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  return router;
}

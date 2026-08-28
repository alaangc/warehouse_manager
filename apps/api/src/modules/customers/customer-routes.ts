import {
  CustomerPriceDeactivateSchema,
  CustomerPriceWriteSchema,
  CustomerUpdateSchema,
  CustomerWriteSchema,
} from '@warehouse/contracts';
import { Router, type Request } from 'express';
import { requireAuthenticated, requireRole } from '../../auth/authorization.js';
import type { AppDatabase } from '../../db/database.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { CustomerPriceService } from './customer-price-service.js';
import { CustomerRepository, toCustomerResource } from './customer-repository.js';
import { CustomerService } from './customer-service.js';

function pathId(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new HttpProblem(422, 'ID_INVALID', 'Validation Failed');
  return value;
}
function requestId(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : 'unknown';
}
function priceResource(price: {
  id: string;
  customer_id: string;
  product_id: string;
  unit_price: string;
  valid_from: Date | string;
  valid_to: Date | string | null;
  active: boolean;
}) {
  return {
    id: price.id,
    customerId: price.customer_id,
    productId: price.product_id,
    unitPrice: price.unit_price,
    validFrom: new Date(price.valid_from).toISOString(),
    validTo: price.valid_to ? new Date(price.valid_to).toISOString() : null,
    active: price.active,
  };
}
function mapCustomerError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === '23P01')
      throw new HttpProblem(
        409,
        'CUSTOMER_PRICE_OVERLAP',
        'Conflict',
        'An active price overlaps this period.',
      );
    if (code === '23505') throw new HttpProblem(409, 'CUSTOMER_DUPLICATE', 'Conflict');
    if (code === 'RESOURCE_NOT_FOUND') throw new HttpProblem(404, code, 'Not Found');
    if (code === 'OPTIMISTIC_CONFLICT') throw new HttpProblem(409, code, 'Conflict');
    if (code === 'ARCHIVE_REASON_REQUIRED') throw new HttpProblem(422, code, 'Validation Failed');
  }
  throw error;
}

export function createCustomerRouter(database: AppDatabase): Router {
  const router = Router();
  const customers = new CustomerService(database);
  const prices = new CustomerPriceService(database);
  router.use(requireAuthenticated);
  router.get('/customers', async (request, response, next) => {
    try {
      const search = typeof request.query.search === 'string' ? request.query.search : undefined;
      const active =
        request.principal!.role === 'DRIVER'
          ? true
          : request.query.active === 'true'
            ? true
            : request.query.active === 'false'
              ? false
              : undefined;
      const rows = await database
        .transaction()
        .execute((transaction) => new CustomerRepository(transaction).list(search, active));
      const data = rows.map((row) => toCustomerResource(row, request.principal!.role));
      response.json({ data, page: { hasNextPage: false, nextCursor: null } });
    } catch (error) {
      next(error);
    }
  });
  router.post('/customers', requireRole('ADMINISTRATOR'), async (request, response, next) => {
    try {
      const input = CustomerWriteSchema.parse(request.body);
      const customer = await customers.create(input, request.principal!.id, requestId(request));
      response.status(201).json({
        data: toCustomerResource(customer, 'ADMINISTRATOR'),
      });
    } catch (error) {
      try {
        mapCustomerError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  });
  router.get('/customers/:customerId', async (request, response, next) => {
    try {
      const id = pathId(request.params.customerId);
      const row = await database
        .transaction()
        .execute((transaction) =>
          new CustomerRepository(transaction).detail(id, request.principal!.role === 'DRIVER'),
        );
      if (!row) throw new HttpProblem(404, 'CUSTOMER_NOT_FOUND', 'Not Found');
      response.json({
        data: toCustomerResource(row, request.principal!.role),
      });
    } catch (error) {
      next(error);
    }
  });
  router.patch(
    '/customers/:customerId',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = CustomerUpdateSchema.parse(request.body);
        const customer = await customers.update(
          pathId(request.params.customerId),
          input,
          request.principal!.id,
          requestId(request),
        );
        response.json({
          data: toCustomerResource(customer, 'ADMINISTRATOR'),
        });
      } catch (error) {
        try {
          mapCustomerError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  router.get(
    '/customers/:customerId/prices',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        response.json({
          data: (
            await database
              .selectFrom('customer_price')
              .selectAll()
              .where('customer_id', '=', pathId(request.params.customerId))
              .orderBy('valid_from desc')
              .execute()
          ).map(priceResource),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/customers/:customerId/prices',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = CustomerPriceWriteSchema.parse(request.body);
        const price = await prices.create(
          pathId(request.params.customerId),
          input,
          request.principal!.id,
          requestId(request),
        );
        response.status(201).json({ data: priceResource(price) });
      } catch (error) {
        try {
          mapCustomerError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  router.post(
    '/customer-prices/:customerPriceId/deactivation',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const input = CustomerPriceDeactivateSchema.parse(request.body);
        const price = await prices.deactivate(
          pathId(request.params.customerPriceId),
          input.reason,
          request.principal!.id,
          requestId(request),
        );
        response.json({
          data: priceResource(price),
        });
      } catch (error) {
        try {
          mapCustomerError(error);
        } catch (mapped) {
          next(mapped);
        }
      }
    },
  );
  router.get(
    '/customers/:customerId/sales',
    requireRole('ADMINISTRATOR'),
    async (request, response, next) => {
      try {
        const data = await database
          .transaction()
          .execute((transaction) =>
            new CustomerRepository(transaction).history(pathId(request.params.customerId)),
          );
        response.json({
          data: data.map((sale) => ({
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
          page: { hasNextPage: false, nextCursor: null },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}

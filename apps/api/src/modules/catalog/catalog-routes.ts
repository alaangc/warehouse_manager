import {
  CategoryUpdateSchema,
  CategoryWriteSchema,
  LocationUpdateSchema,
  LocationWriteSchema,
  ProductUpdateSchema,
  ProductWriteSchema,
  UnitUpdateSchema,
  UnitWriteSchema,
  VehicleUpdateSchema,
  VehicleWriteSchema,
} from '@warehouse/contracts';
import { Router, type Request, type RequestHandler } from 'express';
import type { Selectable } from 'kysely';
import type { ZodType } from 'zod';
import { requireAuthenticated, requireRole } from '../../auth/authorization.js';
import type { AppDatabase } from '../../db/database.js';
import type { ProductTable } from '../../db/types.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { CatalogService } from './catalog-service.js';

function pathId(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new HttpProblem(422, 'ID_INVALID', 'Validation Failed');
  return value;
}

function requestIdentifier(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : 'unknown';
}

function mapWriteError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === '23505') {
      throw new HttpProblem(
        409,
        'CATALOG_DUPLICATE',
        'Conflict',
        'The normalized identifier is already in use.',
      );
    }
    if (error.code === 'CATALOG_REFERENCE_INVALID') {
      throw new HttpProblem(422, 'CATALOG_REFERENCE_INVALID', 'Validation Failed');
    }
    if (error.code === 'ARCHIVE_REASON_REQUIRED') {
      throw new HttpProblem(422, 'ARCHIVE_REASON_REQUIRED', 'Validation Failed');
    }
    if (error.code === 'VEHICLE_ASSIGNED') {
      throw new HttpProblem(409, 'VEHICLE_ASSIGNED', 'Conflict');
    }
    if (error.code === 'OPTIMISTIC_CONFLICT') {
      throw new HttpProblem(409, 'OPTIMISTIC_CONFLICT', 'Conflict');
    }
  }
  throw error;
}

function writeHandler<T>(
  schema: ZodType<T>,
  action: (input: T, request: Parameters<RequestHandler>[0]) => Promise<unknown>,
  status = 201,
): RequestHandler {
  return async (request, response, next) => {
    try {
      const result = await action(schema.parse(request.body), request);
      response.status(status).json({ data: result });
    } catch (error) {
      try {
        mapWriteError(error);
      } catch (mapped) {
        next(mapped);
      }
    }
  };
}

function mapProduct(row: Selectable<ProductTable>) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    unitId: row.unit_id,
    standardUnitPrice: Number(row.standard_unit_price).toFixed(4),
    lowStockThreshold: Number(row.low_stock_threshold).toFixed(3),
    active: row.active,
    version: row.version,
  };
}

export function createCatalogRouter(database: AppDatabase): Router {
  const router = Router();
  const catalogService = new CatalogService(database);
  router.use(requireAuthenticated);

  router.get('/locations', async (_request, response, next) => {
    try {
      response.json({
        data: await database
          .selectFrom('location')
          .select(['id', 'code', 'name', 'active', 'version'])
          .orderBy('name')
          .execute(),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/locations',
    requireRole('ADMINISTRATOR'),
    writeHandler(LocationWriteSchema, (input, request) =>
      catalogService.createLocation(input, request.principal!.id, requestIdentifier(request)),
    ),
  );
  router.patch(
    '/locations/:locationId',
    requireRole('ADMINISTRATOR'),
    writeHandler(
      LocationUpdateSchema,
      (input, request) =>
        catalogService.updateLocation(
          pathId(request.params.locationId),
          input,
          request.principal!.id,
          requestIdentifier(request),
        ),
      200,
    ),
  );

  router.get('/categories', async (_request, response, next) => {
    try {
      const rows = await database.selectFrom('category').selectAll().orderBy('name').execute();
      response.json({
        data: rows.map((row) => ({
          id: row.id,
          name: row.name,
          reportingGroup: row.reporting_group,
          active: row.active,
          version: row.version,
        })),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/categories',
    requireRole('ADMINISTRATOR'),
    writeHandler(CategoryWriteSchema, (input, request) =>
      catalogService.createCategory(input, request.principal!.id, requestIdentifier(request)),
    ),
  );
  router.patch(
    '/categories/:categoryId',
    requireRole('ADMINISTRATOR'),
    writeHandler(
      CategoryUpdateSchema,
      (input, request) =>
        catalogService.updateCategory(
          pathId(request.params.categoryId),
          input,
          request.principal!.id,
          requestIdentifier(request),
        ),
      200,
    ),
  );

  router.get('/units', async (_request, response, next) => {
    try {
      const rows = await database.selectFrom('unit').selectAll().orderBy('name').execute();
      response.json({
        data: rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          quantityScale: row.quantity_scale,
          active: row.active,
          version: row.version,
        })),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/units',
    requireRole('ADMINISTRATOR'),
    writeHandler(UnitWriteSchema, (input, request) =>
      catalogService.createUnit(input, request.principal!.id, requestIdentifier(request)),
    ),
  );
  router.patch(
    '/units/:unitId',
    requireRole('ADMINISTRATOR'),
    writeHandler(
      UnitUpdateSchema,
      (input, request) =>
        catalogService.updateUnit(
          pathId(request.params.unitId),
          input,
          request.principal!.id,
          requestIdentifier(request),
        ),
      200,
    ),
  );

  router.get('/vehicles', async (_request, response, next) => {
    try {
      response.json({
        data: await database.selectFrom('vehicle').selectAll().orderBy('name').execute(),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/vehicles',
    requireRole('ADMINISTRATOR'),
    writeHandler(VehicleWriteSchema, (input, request) =>
      catalogService.createVehicle(input, request.principal!.id, requestIdentifier(request)),
    ),
  );
  router.patch(
    '/vehicles/:vehicleId',
    requireRole('ADMINISTRATOR'),
    writeHandler(
      VehicleUpdateSchema,
      (input, request) =>
        catalogService.updateVehicle(
          pathId(request.params.vehicleId),
          input,
          request.principal!.id,
          requestIdentifier(request),
        ),
      200,
    ),
  );

  router.get('/products', async (request, response, next) => {
    try {
      let query = database.selectFrom('product').selectAll().orderBy('name').limit(100);
      const search = request.query.search;
      if (typeof search === 'string')
        query = query.where((eb) =>
          eb.or([eb('name', 'ilike', `%${search}%`), eb('sku', 'ilike', `%${search}%`)]),
        );
      const rows = await query.execute();
      response.json({
        data: rows.map((row) => mapProduct(row)),
        page: { hasNextPage: false, nextCursor: null },
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    '/products',
    requireRole('ADMINISTRATOR'),
    writeHandler(ProductWriteSchema, (input, request) =>
      catalogService
        .createProduct(input, request.principal!.id, requestIdentifier(request))
        .then((row) => mapProduct(row)),
    ),
  );
  router.get('/products/:productId', async (request, response, next) => {
    try {
      const product = await database
        .selectFrom('product')
        .selectAll()
        .where('id', '=', pathId(request.params.productId))
        .executeTakeFirst();
      if (!product) throw new HttpProblem(404, 'PRODUCT_NOT_FOUND', 'Not Found');
      response.json({ data: mapProduct(product) });
    } catch (error) {
      next(error);
    }
  });
  router.patch(
    '/products/:productId',
    requireRole('ADMINISTRATOR'),
    writeHandler(
      ProductUpdateSchema,
      (input, request) =>
        catalogService
          .updateProduct(
            pathId(request.params.productId),
            input,
            request.principal!.id,
            requestIdentifier(request),
          )
          .then((row) => mapProduct(row)),
      200,
    ),
  );

  return router;
}

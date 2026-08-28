import request from 'supertest';
import type { Test } from 'supertest';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  InventoryOperationRequestSchema,
  InventoryTransferRequestSchema,
  ProductWriteSchema,
} from '@warehouse/contracts';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import type { Environment } from '../../../src/config/env.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { createServer } from '../../../src/server.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('inventory contract schemas', () => {
  it('accepts decimal strings and rejects numeric quantities', () => {
    const valid = {
      operationType: 'ENTRY',
      branchId: crypto.randomUUID(),
      reason: 'Initial stock',
      lines: [{ productId: crypto.randomUUID(), quantity: '12.500' }],
    };
    expect(InventoryOperationRequestSchema.parse(valid)).toEqual(valid);
    expect(() =>
      InventoryOperationRequestSchema.parse({
        ...valid,
        lines: [{ ...valid.lines[0], quantity: 12.5 }],
      }),
    ).toThrow();
  });

  it('rejects same-branch transfers and malformed products', () => {
    const branchId = crypto.randomUUID();
    expect(() =>
      InventoryTransferRequestSchema.parse({
        sourceBranchId: branchId,
        destinationBranchId: branchId,
        reason: 'Move',
        lines: [{ productId: crypto.randomUUID(), quantity: '1' }],
      }),
    ).toThrow();
    expect(() =>
      ProductWriteSchema.parse({
        sku: 'A',
        name: 'A',
        categoryId: crypto.randomUUID(),
        unitId: crypto.randomUUID(),
        standardUnitPrice: 1.25,
        lowStockThreshold: '0',
      }),
    ).toThrow();
  });
});

describe('inventory and catalog HTTP contract', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let app: Express;

  const env: Environment = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
    SESSION_SECRET: 'x'.repeat(32),
    APP_ORIGIN: 'https://warehouse.test',
    BUSINESS_TIMEZONE: 'America/Hermosillo',
    BUSINESS_CURRENCY: 'MXN',
    PORT: 3000,
    LOG_LEVEL: 'fatal',
    DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-contract',
  };

  interface Principal {
    cookie: string;
    csrf: string;
    id: string;
  }

  // Sessions are database-backed and persist for the whole file, so one login per
  // username is sufficient; memoizing also stays under the login rate limit (10/min per username).
  const principals = new Map<string, Principal>();

  async function login(username: string): Promise<Principal> {
    const cached = principals.get(username);
    if (cached) return cached;
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .send({ username, password: 'development-password-change-me' });
    expect(response.status).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const csrf = response.headers['x-csrf-token'];
    expect(cookie).toBeDefined();
    expect(csrf).toBeDefined();
    const principal: Principal = {
      cookie: cookie.split(';')[0]!,
      csrf: String(csrf),
      id: (response.body.data as { id: string }).id,
    };
    principals.set(username, principal);
    return principal;
  }

  function authed(principal: Principal) {
    const base = request(app);
    const decorate = (test: Test) =>
      test
        .set('Origin', env.APP_ORIGIN)
        .set('Cookie', principal.cookie)
        .set('X-CSRF-Token', principal.csrf);
    return {
      get: (url: string) => decorate(base.get(url)),
      post: (url: string) => decorate(base.post(url)),
      put: (url: string) => decorate(base.put(url)),
      patch: (url: string) => decorate(base.patch(url)),
      delete: (url: string) => decorate(base.delete(url)),
      head: (url: string) => decorate(base.head(url)),
      options: (url: string) => decorate(base.options(url)),
    };
  }

  function key(): string {
    return crypto.randomUUID();
  }

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
    env.DATABASE_URL = container.connectionString;
    app = createServer(env, { database });
  }, 180_000);

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  it('denies unauthenticated and cross-origin access with RFC 9457 problems', async () => {
    const unauthenticated = await request(app).get('/api/v1/inventory/balances');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['content-type']).toContain('application/problem+json');
    expect(unauthenticated.body.code).toBe('AUTHENTICATION_REQUIRED');
    expect(unauthenticated.body.type).toContain('/problems/authentication-required');

    const admin = await login('admin');
    const withoutCsrf = request(app)
      .post('/api/v1/inventory/operations')
      .set('Origin', env.APP_ORIGIN)
      .set('Cookie', admin.cookie)
      .send({
        operationType: 'ENTRY',
        branchId: crypto.randomUUID(),
        reason: 'x',
        lines: [{ productId: crypto.randomUUID(), quantity: '1' }],
      });
    expect((await withoutCsrf).body.code).toBe('CSRF_INVALID');

    const wrongOrigin = request(app)
      .post('/api/v1/inventory/operations')
      .set('Origin', 'https://evil.example')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        operationType: 'ENTRY',
        branchId: crypto.randomUUID(),
        reason: 'x',
        lines: [{ productId: crypto.randomUUID(), quantity: '1' }],
      });
    expect((await wrongOrigin).body.code).toBe('ORIGIN_FORBIDDEN');

    const missingKey = await authed(admin)
      .post('/api/v1/inventory/operations')
      .send({
        operationType: 'ENTRY',
        branchId: crypto.randomUUID(),
        reason: 'x',
        lines: [{ productId: crypto.randomUUID(), quantity: '1' }],
      });
    expect(missingKey.status).toBe(422);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_INVALID');
  });

  it('lets administrators create and update catalog records with optimistic versions', async () => {
    const admin = await login('admin');
    const unit = await authed(admin)
      .post('/api/v1/units')
      .send({
        code: `U-${crypto.randomUUID().slice(0, 12)}`,
        name: 'Piece',
        quantityScale: 0,
      });
    expect(unit.status).toBe(201);
    const category = await authed(admin)
      .post('/api/v1/categories')
      .send({
        name: `Cat-${crypto.randomUUID()}`,
        reportingGroup: 'OTHER',
      });
    expect(category.status).toBe(201);
    const product = await authed(admin)
      .post('/api/v1/products')
      .send({
        sku: `SKU-${crypto.randomUUID()}`,
        name: 'Contract product',
        description: 'Test fixture',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '12.5000',
        lowStockThreshold: '3.000',
      });
    expect(product.status).toBe(201);
    expect(product.body.data.standardUnitPrice).toBe('12.5000');
    expect(product.body.data.lowStockThreshold).toBe('3.000');

    const listed = await authed(admin).get('/api/v1/products?search=Contract');
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].name).toBe('Contract product');

    const updated = await authed(admin)
      .patch(`/api/v1/products/${(product.body.data as { id: string }).id}`)
      .send({
        sku: (product.body.data as { sku: string }).sku,
        name: 'Renamed product',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '13.0000',
        lowStockThreshold: '3.000',
        active: true,
        expectedVersion: (product.body.data as { version: number }).version,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Renamed product');

    const stale = await authed(admin)
      .patch(`/api/v1/products/${(product.body.data as { id: string }).id}`)
      .send({
        sku: (product.body.data as { sku: string }).sku,
        name: 'Renamed again',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '13.0000',
        lowStockThreshold: '3.000',
        active: true,
        expectedVersion: (product.body.data as { version: number }).version,
      });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('OPTIMISTIC_CONFLICT');

    const archiveWithoutReason = await authed(admin)
      .patch(`/api/v1/products/${(updated.body.data as { id: string }).id}`)
      .send({
        sku: (updated.body.data as { sku: string }).sku,
        name: 'Renamed product',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '13.0000',
        lowStockThreshold: '3.000',
        active: false,
        expectedVersion: (updated.body.data as { version: number }).version,
      });
    expect(archiveWithoutReason.status).toBe(422);
    expect(archiveWithoutReason.body.code).toBe('ARCHIVE_REASON_REQUIRED');
  });

  it('rejects duplicate catalog identifiers and numeric money', async () => {
    const admin = await login('admin');
    const unit = await authed(admin).post('/api/v1/units').send({
      code: 'DUP-UNIT',
      name: 'Duplicate unit',
      quantityScale: 0,
    });
    expect(unit.status).toBe(201);
    const duplicate = await authed(admin).post('/api/v1/units').send({
      code: 'dup-unit',
      name: 'Duplicate unit again',
      quantityScale: 0,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CATALOG_DUPLICATE');

    const category = await authed(admin)
      .post('/api/v1/categories')
      .send({
        name: `Cat-${crypto.randomUUID()}`,
        reportingGroup: 'OTHER',
      });
    const numericPrice = await authed(admin)
      .post('/api/v1/products')
      .send({
        sku: `SKU-${crypto.randomUUID()}`,
        name: 'Numeric money product',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: 10,
        lowStockThreshold: '1.000',
      });
    expect(numericPrice.status).toBe(422);
    expect(numericPrice.body.code).toBe('VALIDATION_FAILED');
    expect(numericPrice.body.errors.standardUnitPrice).toBeDefined();
  });

  it('creates branch locations with stock positions and rejects duplicate codes', async () => {
    const admin = await login('admin');
    const code = `LOC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await authed(admin).post('/api/v1/locations').send({
      code,
      name: 'Contract dock',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe(code);

    const duplicate = await authed(admin).post('/api/v1/locations').send({
      code: code.toLowerCase(),
      name: 'Contract dock again',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CATALOG_DUPLICATE');

    const denied = await authed(await login('driver'))
      .post('/api/v1/locations')
      .send({ code: 'LOC-DENIED', name: 'Driver dock' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ROLE_FORBIDDEN');

    const listed = await authed(admin).get('/api/v1/locations');
    expect(listed.body.data).toHaveLength(3);
  });

  it('denies driver catalog mutations but allows reading', async () => {
    const driver = await login('driver');
    const denied = await authed(driver)
      .post('/api/v1/products')
      .send({
        sku: `SKU-${crypto.randomUUID()}`,
        name: 'Driver should not create',
        categoryId: crypto.randomUUID(),
        unitId: crypto.randomUUID(),
        standardUnitPrice: '1.0000',
        lowStockThreshold: '1.000',
      });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ROLE_FORBIDDEN');
    const listed = await request(app).get('/api/v1/products').set('Cookie', driver.cookie);
    expect(listed.status).toBe(200);
  });

  it('blocks archiving a vehicle assigned to an active route', async () => {
    const admin = await login('admin');
    const vehicle = await authed(admin)
      .post('/api/v1/vehicles')
      .send({
        code: `V-${crypto.randomUUID().slice(0, 12)}`,
        name: 'Contract van',
      });
    expect(vehicle.status).toBe(201);
    const vehicleId = (vehicle.body.data as { id: string }).id;
    const driver = await login('driver');
    const magdalena = await database
      .selectFrom('location')
      .select('id')
      .where('code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    await database
      .insertInto('route')
      .values({
        route_number: `R-${crypto.randomUUID()}`,
        state: 'PREPARING',
        origin_location_id: magdalena.id,
        driver_id: driver.id,
        vehicle_id: vehicleId,
        business_date: new Date().toISOString().slice(0, 10),
        created_by: admin.id,
      })
      .execute();
    const archive = await authed(admin)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .send({
        code: 'V-CONTRACT',
        name: 'Contract van',
        active: false,
        expectedVersion: (vehicle.body.data as { version: number }).version,
      });
    expect(archive.status).toBe(409);
    expect(archive.body.code).toBe('VEHICLE_ASSIGNED');
  });

  it('records entry with decimal strings and exposes balances, movements, and alerts', async () => {
    const admin = await login('admin');
    const unit = await authed(admin)
      .post('/api/v1/units')
      .send({
        code: `U-${crypto.randomUUID().slice(0, 12)}`,
        name: 'Bottle',
        quantityScale: 0,
      });
    const category = await authed(admin)
      .post('/api/v1/categories')
      .send({
        name: `Cat-${crypto.randomUUID()}`,
        reportingGroup: 'SODAS',
      });
    const product = await authed(admin)
      .post('/api/v1/products')
      .send({
        sku: `SKU-${crypto.randomUUID()}`,
        name: 'Alert product',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '25.0000',
        lowStockThreshold: '10.000',
      });
    const productId = (product.body.data as { id: string }).id;
    const magdalena = await database
      .selectFrom('location')
      .select('id')
      .where('code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();

    const entry = await authed(admin)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', key())
      .send({
        operationType: 'ENTRY',
        branchId: magdalena.id,
        reason: 'Initial stock',
        lines: [{ productId, quantity: '8.000' }],
      });
    expect(entry.status).toBe(201);
    expect(entry.body.data.operationType).toBe('ENTRY');

    const balances = await authed(admin).get(`/api/v1/inventory/balances?productId=${productId}`);
    expect(balances.status).toBe(200);
    expect(balances.body.data).toHaveLength(1);
    expect(balances.body.data[0].quantity).toBe('8.000');
    expect(balances.body.data[0].lowStockAlert).toBe(true);
    expect(balances.body.data[0].stockLocation.branchId).toBe(magdalena.id);

    const movements = await authed(admin).get(`/api/v1/inventory/movements?productId=${productId}`);
    expect(movements.status).toBe(200);
    expect(movements.body.data).toHaveLength(1);
    expect(movements.body.data[0].operationType).toBe('ENTRY');
    expect(movements.body.data[0].reason).toBe('Initial stock');

    const alertsOnly = await authed(admin).get(
      `/api/v1/inventory/balances?productId=${productId}&alertsOnly=true`,
    );
    expect(alertsOnly.body.data).toHaveLength(1);
  });

  it('rejects insufficient decrements with 409 and leaves balances untouched', async () => {
    const admin = await login('admin');
    const unit = await authed(admin)
      .post('/api/v1/units')
      .send({
        code: `U-${crypto.randomUUID().slice(0, 12)}`,
        name: 'Charcoal',
        quantityScale: 0,
      });
    const category = await authed(admin)
      .post('/api/v1/categories')
      .send({
        name: `Cat-${crypto.randomUUID()}`,
        reportingGroup: 'CHARCOAL',
      });
    const product = await authed(admin)
      .post('/api/v1/products')
      .send({
        sku: `SKU-${crypto.randomUUID()}`,
        name: 'Insufficient product',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '5.0000',
        lowStockThreshold: '0.000',
      });
    const productId = (product.body.data as { id: string }).id;
    const magdalena = await database
      .selectFrom('location')
      .select('id')
      .where('code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    const entry = await authed(admin)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', key())
      .send({
        operationType: 'ENTRY',
        branchId: magdalena.id,
        reason: 'Initial stock',
        lines: [{ productId, quantity: '4.000' }],
      });
    expect(entry.status).toBe(201);

    const overdraw = await authed(admin)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', key())
      .send({
        operationType: 'NEGATIVE_ADJUSTMENT',
        branchId: magdalena.id,
        reason: 'Counted stock',
        lines: [{ productId, quantity: '5.000' }],
      });
    expect(overdraw.status).toBe(409);
    expect(overdraw.body.code).toBe('INSUFFICIENT_INVENTORY');

    const balances = await authed(admin).get(`/api/v1/inventory/balances?productId=${productId}`);
    expect(balances.body.data[0].quantity).toBe('4.000');
    const movements = await authed(admin).get(`/api/v1/inventory/movements?productId=${productId}`);
    expect(movements.body.data).toHaveLength(1);
  });

  it('transfers between branches and reversals restore balances', async () => {
    const admin = await login('admin');
    const unit = await authed(admin)
      .post('/api/v1/units')
      .send({
        code: `U-${crypto.randomUUID().slice(0, 12)}`,
        name: 'Tostada',
        quantityScale: 0,
      });
    const category = await authed(admin)
      .post('/api/v1/categories')
      .send({
        name: `Cat-${crypto.randomUUID()}`,
        reportingGroup: 'TOSTADAS',
      });
    const product = await authed(admin)
      .post('/api/v1/products')
      .send({
        sku: `SKU-${crypto.randomUUID()}`,
        name: 'Transfer product',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '2.0000',
        lowStockThreshold: '0.000',
      });
    const productId = (product.body.data as { id: string }).id;
    const [magdalena, caborca] = await database
      .selectFrom('location')
      .select('id')
      .where('code', 'in', ['MAGDALENA', 'CABORCA'])
      .execute();
    await authed(admin)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', key())
      .send({
        operationType: 'ENTRY',
        branchId: magdalena.id,
        reason: 'Initial stock',
        lines: [{ productId, quantity: '10.000' }],
      });

    const transfer = await authed(admin)
      .post('/api/v1/inventory/transfers')
      .set('Idempotency-Key', key())
      .send({
        sourceBranchId: magdalena.id,
        destinationBranchId: caborca.id,
        reason: 'Rebalance',
        lines: [{ productId, quantity: '3.000' }],
      });
    expect(transfer.status).toBe(201);
    const afterTransfer = await authed(admin).get(
      `/api/v1/inventory/balances?productId=${productId}`,
    );
    const quantities = new Map(
      afterTransfer.body.data.map(
        (row: { stockLocation: { branchId: string }; quantity: string }) => [
          row.stockLocation.branchId,
          row.quantity,
        ],
      ),
    );
    expect(quantities.get(magdalena.id)).toBe('7.000');
    expect(quantities.get(caborca.id)).toBe('3.000');

    const sameBranch = await authed(admin)
      .post('/api/v1/inventory/transfers')
      .set('Idempotency-Key', key())
      .send({
        sourceBranchId: magdalena.id,
        destinationBranchId: magdalena.id,
        reason: 'No-op',
        lines: [{ productId, quantity: '1.000' }],
      });
    expect(sameBranch.status).toBe(422);

    const reversal = await authed(admin)
      .post(`/api/v1/inventory/operations/${(transfer.body.data as { id: string }).id}/reversal`)
      .set('Idempotency-Key', key())
      .send({ reason: 'Transfer was wrong' });
    expect(reversal.status).toBe(201);
    const afterReversal = await authed(admin).get(
      `/api/v1/inventory/balances?productId=${productId}`,
    );
    const restored = new Map(
      afterReversal.body.data.map(
        (row: { stockLocation: { branchId: string }; quantity: string }) => [
          row.stockLocation.branchId,
          row.quantity,
        ],
      ),
    );
    expect(restored.get(magdalena.id)).toBe('10.000');
    expect(restored.get(caborca.id)).toBe('0.000');
  });

  it('scopes driver balance and movement access to their assigned route', async () => {
    const admin = await login('admin');
    const driver = await login('driver');
    const unit = await authed(admin)
      .post('/api/v1/units')
      .send({
        code: `U-${crypto.randomUUID().slice(0, 12)}`,
        name: 'Route piece',
        quantityScale: 0,
      });
    const category = await authed(admin)
      .post('/api/v1/categories')
      .send({
        name: `Cat-${crypto.randomUUID()}`,
        reportingGroup: 'OTHER',
      });
    const product = await authed(admin)
      .post('/api/v1/products')
      .send({
        sku: `SKU-${crypto.randomUUID()}`,
        name: 'Route scoped product',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '1.0000',
        lowStockThreshold: '0.000',
      });
    const productId = (product.body.data as { id: string }).id;
    const magdalena = await database
      .selectFrom('location')
      .select('id')
      .where('code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    await authed(admin)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', key())
      .send({
        operationType: 'ENTRY',
        branchId: magdalena.id,
        reason: 'Branch stock',
        lines: [{ productId, quantity: '2.000' }],
      });

    const otherRoute = await database
      .insertInto('route')
      .values({
        route_number: `R-${crypto.randomUUID()}`,
        state: 'CLOSED',
        origin_location_id: magdalena.id,
        driver_id: driver.id,
        vehicle_id: (
          await database
            .selectFrom('vehicle')
            .select('id')
            .orderBy('id')
            .limit(1)
            .executeTakeFirst()
        )?.id,
        business_date: new Date().toISOString().slice(0, 10),
        created_by: admin.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const unfiltered = await authed(admin).get('/api/v1/inventory/movements');
    const driverUnfiltered = await request(app)
      .get('/api/v1/inventory/movements')
      .set('Cookie', driver.cookie);
    expect(driverUnfiltered.status).toBe(403);
    expect(driverUnfiltered.body.code).toBe('ROUTE_SCOPE_REQUIRED');

    const scoped = await request(app)
      .get(`/api/v1/inventory/movements?routeId=${otherRoute.id}`)
      .set('Cookie', driver.cookie);
    expect(scoped.status).toBe(200);
    expect(scoped.body.data).toHaveLength(0);

    const driverBalances = await request(app)
      .get(`/api/v1/inventory/balances?productId=${productId}`)
      .set('Cookie', driver.cookie);
    expect(driverBalances.status).toBe(200);
    expect(driverBalances.body.data).toHaveLength(0);

    const deniedOperation = await authed(driver)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', key())
      .send({
        operationType: 'ENTRY',
        branchId: magdalena.id,
        reason: 'Drivers cannot enter stock',
        lines: [{ productId, quantity: '1.000' }],
      });
    expect(deniedOperation.status).toBe(403);
    expect(unfiltered.status).toBe(200);
  });

  it('replays idempotent retries and conflicts on hash mismatch', async () => {
    const admin = await login('admin');
    const unit = await authed(admin)
      .post('/api/v1/units')
      .send({
        code: `U-${crypto.randomUUID().slice(0, 12)}`,
        name: 'Retry piece',
        quantityScale: 0,
      });
    const category = await authed(admin)
      .post('/api/v1/categories')
      .send({
        name: `Cat-${crypto.randomUUID()}`,
        reportingGroup: 'OTHER',
      });
    const product = await authed(admin)
      .post('/api/v1/products')
      .send({
        sku: `SKU-${crypto.randomUUID()}`,
        name: 'Retry product',
        categoryId: (category.body.data as { id: string }).id,
        unitId: (unit.body.data as { id: string }).id,
        standardUnitPrice: '1.0000',
        lowStockThreshold: '0.000',
      });
    const productId = (product.body.data as { id: string }).id;
    const magdalena = await database
      .selectFrom('location')
      .select('id')
      .where('code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    const idempotencyKey = key();
    const body = {
      operationType: 'ENTRY',
      branchId: magdalena.id,
      reason: 'Uncertain first attempt',
      lines: [{ productId, quantity: '1.000' }],
    };
    const first = await authed(admin)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
    expect(first.status).toBe(201);
    const replay = await authed(admin)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe((first.body.data as { id: string }).id);

    const conflicting = await authed(admin)
      .post('/api/v1/inventory/operations')
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...body, lines: [{ productId, quantity: '2.000' }] });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe('IDEMPOTENCY_HASH_CONFLICT');

    const balances = await authed(admin).get(`/api/v1/inventory/balances?productId=${productId}`);
    expect(balances.body.data).toHaveLength(1);
    expect(balances.body.data[0].quantity).toBe('1.000');
  });

  it('returns RFC 9457 problems for unknown resources and routes', async () => {
    const admin = await login('admin');
    const product = await authed(admin).get(`/api/v1/products/${crypto.randomUUID()}`);
    expect(product.status).toBe(404);
    expect(product.headers['content-type']).toContain('application/problem+json');
    expect(product.body.code).toBe('PRODUCT_NOT_FOUND');
    const missing = await authed(admin).get('/api/v1/definitely/not-a-route');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('RESOURCE_NOT_FOUND');
  });
});

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  RouteCreateSchema,
  RouteLoadDraftSchema,
  RouteReconciliationSchema,
  RouteTransitionSchema,
} from '@warehouse/contracts';
import type { Express } from 'express';
import request from 'supertest';
import type { Response, Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import type { Environment } from '../../../src/config/env.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { createServer } from '../../../src/server.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('route command and OpenAPI contracts', () => {
  it('accepts an administrator assignment while allowing the server to number the route', () => {
    const request = {
      originLocationId: crypto.randomUUID(),
      driverId: crypto.randomUUID(),
      vehicleId: crypto.randomUUID(),
      businessDate: '2026-08-27',
    };
    expect(RouteCreateSchema.parse(request)).toEqual(request);
    expect(() => RouteCreateSchema.parse({ ...request, businessDate: '27/08/2026' })).toThrow();
  });

  it('requires exact quantities and optimistic versions for load and transitions', () => {
    const productId = crypto.randomUUID();
    expect(
      RouteLoadDraftSchema.parse({
        expectedVersion: 1,
        lines: [{ productId, quantity: '5.000' }],
      }),
    ).toMatchObject({ expectedVersion: 1 });
    expect(() =>
      RouteLoadDraftSchema.parse({ lines: [{ productId, quantity: '5.000' }] }),
    ).toThrow();
    expect(() => RouteTransitionSchema.parse({ expectedVersion: 0 })).toThrow();
  });

  it('accepts signed reconciliation input only as exact quantity strings', () => {
    const valid = {
      expectedVersion: 3,
      lines: [
        {
          productId: crypto.randomUUID(),
          physicalReturnQuantity: '4.000',
          differenceReason: 'One damaged unit',
        },
      ],
    };
    expect(RouteReconciliationSchema.parse(valid)).toEqual(valid);
    expect(() =>
      RouteReconciliationSchema.parse({
        ...valid,
        lines: [{ ...valid.lines[0], physicalReturnQuantity: 4 }],
      }),
    ).toThrow();
  });

  it('documents every route lifecycle operation and projection', async () => {
    const openapi = await readFile(
      fileURLToPath(new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url)),
      'utf8',
    );
    for (const path of [
      '/routes:',
      '/routes/{routeId}:',
      '/routes/{routeId}/load:',
      '/routes/{routeId}/load/confirmation:',
      '/routes/{routeId}/start:',
      '/routes/{routeId}/return:',
      '/routes/{routeId}/reconciliation:',
      '/routes/{routeId}/close:',
    ]) {
      expect(openapi).toContain(`  ${path}`);
    }
    for (const schema of [
      'RouteResponse',
      'RouteListResponse',
      'RouteLoadResponse',
      'RouteReconciliationResponse',
      'RouteDetailResponse',
    ]) {
      expect(openapi).toContain(`    ${schema}:`);
    }
  });
});

describe('route lifecycle HTTP contract', () => {
  interface Principal {
    cookie: string;
    csrf: string;
    id: string;
  }

  interface RouteResource {
    id: string;
    routeNumber: string;
    state: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';
    originLocationId: string;
    driverId: string;
    vehicleId: string;
    version: number;
  }

  let container: TestDatabase;
  let database: AppDatabase;
  let app: Express;
  let admin: Principal;
  let driver: Principal;
  let anotherDriver: Principal;
  let originId: string;
  let originStockId: string;
  let productId: string;
  let vehicleId: string;

  const env: Environment = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
    SESSION_SECRET: 'x'.repeat(32),
    APP_ORIGIN: 'https://warehouse.test',
    BUSINESS_TIMEZONE: 'America/Hermosillo',
    BUSINESS_CURRENCY: 'MXN',
    PORT: 3000,
    LOG_LEVEL: 'fatal',
    DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-routes-contract',
  };

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
    const principal = {
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
    };
  }

  function command(principal: Principal, path: string, body: unknown) {
    return authed(principal).post(path).set('Idempotency-Key', crypto.randomUUID()).send(body);
  }

  function expectProblem(response: Response, status: number, code: string): void {
    expect(response.status).toBe(status);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status, code });
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

    admin = await login('admin');
    driver = await login('driver');
    anotherDriver = await login('driver-firefox');

    const unit = await database
      .insertInto('unit')
      .values({
        code: `ROUTE-${crypto.randomUUID()}`,
        name: 'Route contract unit',
        quantity_scale: 3,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const category = await database
      .insertInto('category')
      .values({
        name: `Route contract category ${crypto.randomUUID()}`,
        reporting_group: 'OTHER',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const product = await database
      .insertInto('product')
      .values({
        sku: `ROUTE-${crypto.randomUUID()}`,
        name: 'Route contract product',
        description: null,
        category_id: category.id,
        unit_id: unit.id,
        standard_unit_price: '10.0000',
        low_stock_threshold: '1.000',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    productId = product.id;
    const vehicle = await database
      .insertInto('vehicle')
      .values({
        code: `ROUTE-${crypto.randomUUID()}`,
        name: 'Route contract vehicle',
        registration: null,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    vehicleId = vehicle.id;
    const origin = await database
      .selectFrom('location')
      .innerJoin('stock_location', 'stock_location.branch_id', 'location.id')
      .select(['location.id', 'stock_location.id as stockLocationId'])
      .where('location.code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    originId = origin.id;
    originStockId = origin.stockLocationId;
    await database
      .insertInto('inventory_balance')
      .values({ stock_location_id: originStockId, product_id: productId, quantity: '10.000' })
      .execute();
  }, 120_000);

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  it('covers create, scoped access, every transition, reconciliation, and complete history', async () => {
    const assignment = {
      routeNumber: `HTTP-${crypto.randomUUID()}`,
      originLocationId: originId,
      driverId: driver.id,
      vehicleId,
      businessDate: '2026-09-03',
    };

    expectProblem(
      await authed(driver).post('/api/v1/routes').send(assignment),
      403,
      'ROLE_FORBIDDEN',
    );
    expectProblem(
      await authed(admin)
        .post('/api/v1/routes')
        .send({
          ...assignment,
          routeNumber: `${assignment.routeNumber}-BAD`,
          vehicleId: crypto.randomUUID(),
        }),
      422,
      'ROUTE_ASSIGNMENT_INVALID',
    );

    const createdResponse = await authed(admin).post('/api/v1/routes').send(assignment);
    expect(createdResponse.status).toBe(201);
    const created = createdResponse.body.data as RouteResource;
    expect(created).toMatchObject({
      routeNumber: assignment.routeNumber,
      state: 'PREPARING',
      originLocationId: originId,
      driverId: driver.id,
      vehicleId,
      version: 1,
    });

    const adminList = await authed(admin).get('/api/v1/routes');
    expect(adminList.status).toBe(200);
    expect(adminList.body.page).toEqual({ hasNextPage: false, nextCursor: null });
    expect(adminList.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
    const driverList = await authed(driver).get('/api/v1/routes');
    expect(driverList.status).toBe(200);
    expect(driverList.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
    const anotherList = await authed(anotherDriver).get('/api/v1/routes');
    expect(anotherList.status).toBe(200);
    expect(anotherList.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const assignedDetail = async (state: RouteResource['state']) => {
      const response = await authed(driver).get(`/api/v1/routes/${created.id}`);
      expect(response.status).toBe(200);
      expect(response.body.data.route).toMatchObject({ id: created.id, state });
      return response.body.data as {
        route: RouteResource;
        load: null | { id: string; state: string; version: number; lines: unknown[] };
        balances: Array<{ productId: string; quantity: string }>;
        movements: Array<Record<string, unknown>>;
        sales: unknown[];
        reconciliation: null | { state: string; lines: Array<Record<string, unknown>> };
      };
    };

    const preparing = await assignedDetail('PREPARING');
    expect(preparing).toMatchObject({
      load: null,
      balances: [],
      movements: [],
      sales: [],
      reconciliation: null,
    });
    expectProblem(
      await authed(anotherDriver).get(`/api/v1/routes/${created.id}`),
      403,
      'ROUTE_FORBIDDEN',
    );
    expectProblem(
      await command(driver, `/api/v1/routes/${created.id}/start`, {
        expectedVersion: created.version,
      }),
      409,
      'LOAD_NOT_CONFIRMED',
    );
    expectProblem(
      await command(driver, `/api/v1/routes/${created.id}/load/confirmation`, {
        expectedVersion: created.version,
      }),
      409,
      'LOAD_NOT_DRAFT',
    );

    const loadRequest = {
      expectedVersion: created.version,
      lines: [{ productId, quantity: '5.000' }],
    };
    expectProblem(
      await authed(admin).put(`/api/v1/routes/${created.id}/load`).send(loadRequest),
      403,
      'ROLE_FORBIDDEN',
    );
    expectProblem(
      await authed(anotherDriver).put(`/api/v1/routes/${created.id}/load`).send(loadRequest),
      403,
      'ROUTE_FORBIDDEN',
    );
    const draftResponse = await authed(driver)
      .put(`/api/v1/routes/${created.id}/load`)
      .send(loadRequest);
    expect(draftResponse.status).toBe(200);
    expect(draftResponse.body.data).toMatchObject({
      routeId: created.id,
      state: 'DRAFT',
      recordedBy: driver.id,
      lines: [{ productId, quantity: '5.000' }],
      version: 2,
    });

    const loadVersion = (draftResponse.body.data as { version: number }).version;
    const confirmationKey = crypto.randomUUID();
    const confirmedResponse = await authed(driver)
      .post(`/api/v1/routes/${created.id}/load/confirmation`)
      .set('Idempotency-Key', confirmationKey)
      .send({ expectedVersion: loadVersion });
    expect(confirmedResponse.status).toBe(200);
    expect(confirmedResponse.body.data.load).toMatchObject({ state: 'CONFIRMED', version: 3 });
    expect(confirmedResponse.body.data.balances).toEqual([
      expect.objectContaining({ productId, quantity: '5.000' }),
    ]);
    expect(confirmedResponse.body.data.movements).toEqual([
      expect.objectContaining({
        operationType: 'ROUTE_LOAD',
        productId,
        quantity: '5.000',
        source: expect.objectContaining({ kind: 'BRANCH', branchId: originId }),
        destination: expect.objectContaining({ kind: 'ROUTE', routeId: created.id }),
      }),
    ]);
    const confirmationReplay = await authed(driver)
      .post(`/api/v1/routes/${created.id}/load/confirmation`)
      .set('Idempotency-Key', confirmationKey)
      .send({ expectedVersion: loadVersion });
    expect(confirmationReplay.status).toBe(200);
    expect(confirmationReplay.body.data.load.id).toBe(confirmedResponse.body.data.load.id);
    await assignedDetail('PREPARING');

    expectProblem(
      await command(anotherDriver, `/api/v1/routes/${created.id}/start`, {
        expectedVersion: created.version,
      }),
      403,
      'ROUTE_FORBIDDEN',
    );
    const startedResponse = await command(driver, `/api/v1/routes/${created.id}/start`, {
      expectedVersion: created.version,
    });
    expect(startedResponse.status).toBe(200);
    const started = startedResponse.body.data as RouteResource;
    expect(started).toMatchObject({ id: created.id, state: 'EN_ROUTE', version: 2 });
    await assignedDetail('EN_ROUTE');
    expectProblem(
      await command(driver, `/api/v1/routes/${created.id}/start`, {
        expectedVersion: started.version,
      }),
      409,
      'INVALID_ROUTE_TRANSITION',
    );

    expectProblem(
      await command(anotherDriver, `/api/v1/routes/${created.id}/return`, {
        expectedVersion: started.version,
      }),
      403,
      'ROUTE_FORBIDDEN',
    );
    const returnedResponse = await command(driver, `/api/v1/routes/${created.id}/return`, {
      expectedVersion: started.version,
    });
    expect(returnedResponse.status).toBe(200);
    const returned = returnedResponse.body.data as RouteResource;
    expect(returned).toMatchObject({ id: created.id, state: 'RETURNED', version: 3 });
    await assignedDetail('RETURNED');

    const reconciliationRequest = {
      expectedVersion: returned.version,
      lines: [{ productId, physicalReturnQuantity: '4.000' }],
    };
    expectProblem(
      await authed(driver)
        .put(`/api/v1/routes/${created.id}/reconciliation`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send(reconciliationRequest),
      403,
      'ROLE_FORBIDDEN',
    );
    expectProblem(
      await command(admin, `/api/v1/routes/${created.id}/close`, {
        expectedVersion: returned.version,
      }),
      409,
      'RECONCILIATION_NOT_APPROVED',
    );
    expectProblem(
      await authed(admin)
        .put(`/api/v1/routes/${created.id}/reconciliation`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send(reconciliationRequest),
      422,
      'DIFFERENCE_REASON_REQUIRED',
    );

    const reconciliationResponse = await authed(admin)
      .put(`/api/v1/routes/${created.id}/reconciliation`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        ...reconciliationRequest,
        lines: [
          {
            ...reconciliationRequest.lines[0],
            differenceReason: 'One damaged unit',
          },
        ],
      });
    expect(reconciliationResponse.status).toBe(200);
    expect(reconciliationResponse.body.data).toMatchObject({
      routeId: created.id,
      state: 'APPROVED',
      recordedBy: admin.id,
      approvedBy: admin.id,
      lines: [
        {
          productId,
          loadedQuantity: '5.000',
          soldQuantity: '0.000',
          expectedReturnQuantity: '5.000',
          physicalReturnQuantity: '4.000',
          differenceQuantity: '1.000',
          differenceReason: 'One damaged unit',
        },
      ],
    });
    expectProblem(
      await command(driver, `/api/v1/routes/${created.id}/close`, {
        expectedVersion: returned.version,
      }),
      403,
      'ROLE_FORBIDDEN',
    );

    const closedResponse = await command(admin, `/api/v1/routes/${created.id}/close`, {
      expectedVersion: returned.version,
    });
    expect(closedResponse.status).toBe(200);
    const closed = closedResponse.body.data as RouteResource;
    expect(closed).toMatchObject({ id: created.id, state: 'CLOSED', version: 4 });

    const closedDetail = await assignedDetail('CLOSED');
    expect(closedDetail.load).toMatchObject({ state: 'CONFIRMED' });
    expect(closedDetail.balances).toEqual([
      expect.objectContaining({ productId, quantity: '0.000' }),
    ]);
    expect(closedDetail.sales).toEqual([]);
    expect(closedDetail.reconciliation).toMatchObject({
      state: 'APPROVED',
      lines: [
        expect.objectContaining({
          productId,
          differenceQuantity: '1.000',
          differenceReason: 'One damaged unit',
        }),
      ],
    });
    expect(closedDetail.movements.map((movement) => movement.operationType).sort()).toEqual([
      'NEGATIVE_ADJUSTMENT',
      'ROUTE_LOAD',
      'ROUTE_RETURN',
    ]);
    expect(closedDetail.movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationType: 'NEGATIVE_ADJUSTMENT',
          productId,
          quantity: '1.000',
          reason: 'One damaged unit',
          source: expect.objectContaining({ kind: 'ROUTE', routeId: created.id }),
          destination: null,
        }),
        expect.objectContaining({
          operationType: 'ROUTE_RETURN',
          productId,
          quantity: '4.000',
          source: expect.objectContaining({ kind: 'ROUTE', routeId: created.id }),
          destination: expect.objectContaining({ kind: 'BRANCH', branchId: originId }),
        }),
      ]),
    );

    expectProblem(
      await authed(driver)
        .put(`/api/v1/routes/${created.id}/load`)
        .send({
          expectedVersion: loadVersion,
          lines: [{ productId, quantity: '1.000' }],
        }),
      409,
      'ROUTE_NOT_PREPARING',
    );
    expectProblem(
      await command(driver, `/api/v1/routes/${created.id}/return`, {
        expectedVersion: closed.version,
      }),
      409,
      'INVALID_ROUTE_TRANSITION',
    );
    expectProblem(
      await authed(anotherDriver).get(`/api/v1/routes/${created.id}`),
      403,
      'ROUTE_FORBIDDEN',
    );

    const closedList = await authed(driver).get('/api/v1/routes');
    expect(closedList.status).toBe(200);
    expect(closedList.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, state: 'CLOSED' })]),
    );
  });
});

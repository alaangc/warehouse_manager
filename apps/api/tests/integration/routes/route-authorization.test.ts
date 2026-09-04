import { fileURLToPath } from 'node:url';
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

interface Principal {
  cookie: string;
  csrf: string;
  id: string;
}

interface RouteResource {
  id: string;
  state: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';
  version: number;
}

describe('route authorization with PostgreSQL 18', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let app: Express;
  let admin: Principal;
  let assignedDriver: Principal;
  let anotherDriver: Principal;
  let originId: string;
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
    DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-route-authorization',
  };

  async function login(username: string): Promise<Principal> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', env.APP_ORIGIN)
      .send({ username, password: 'development-password-change-me' });
    expect(response.status).toBe(200);
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toBeDefined();
    expect(response.headers['x-csrf-token']).toBeDefined();
    return {
      cookie: cookie.split(';')[0]!,
      csrf: String(response.headers['x-csrf-token']),
      id: (response.body.data as { id: string }).id,
    };
  }

  function authed(principal: Principal) {
    const agent = request(app);
    const decorate = (test: Test) =>
      test
        .set('Origin', env.APP_ORIGIN)
        .set('Cookie', principal.cookie)
        .set('X-CSRF-Token', principal.csrf);
    return {
      get: (path: string) => decorate(agent.get(path)),
      post: (path: string) => decorate(agent.post(path)),
      put: (path: string) => decorate(agent.put(path)),
    };
  }

  function command(principal: Principal, path: string, body: unknown) {
    return authed(principal).post(path).set('Idempotency-Key', crypto.randomUUID()).send(body);
  }

  function expectForbidden(response: Response, code: 'ROLE_FORBIDDEN' | 'ROUTE_FORBIDDEN') {
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ status: 403, code });
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
    [admin, assignedDriver, anotherDriver] = await Promise.all([
      login('admin'),
      login('driver'),
      login('driver-firefox'),
    ]);

    const unit = await database
      .insertInto('unit')
      .values({
        code: `AUTH-${crypto.randomUUID()}`,
        name: 'Authorization unit',
        quantity_scale: 3,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const category = await database
      .insertInto('category')
      .values({
        name: `Authorization category ${crypto.randomUUID()}`,
        reporting_group: 'OTHER',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const product = await database
      .insertInto('product')
      .values({
        sku: `AUTH-${crypto.randomUUID()}`,
        name: 'Authorization product',
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
        code: `AUTH-${crypto.randomUUID()}`,
        name: 'Authorization vehicle',
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
    await database
      .insertInto('inventory_balance')
      .values({
        stock_location_id: origin.stockLocationId,
        product_id: productId,
        quantity: '10.000',
      })
      .execute();
  }, 120_000);

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  it('enforces role and assigned-Driver scope across the complete route lifecycle', async () => {
    const assignment = {
      routeNumber: `AUTH-${crypto.randomUUID()}`,
      originLocationId: originId,
      driverId: assignedDriver.id,
      vehicleId,
      businessDate: '2026-09-03',
    };
    expectForbidden(
      await authed(assignedDriver).post('/api/v1/routes').send(assignment),
      'ROLE_FORBIDDEN',
    );
    const createResponse = await authed(admin).post('/api/v1/routes').send(assignment);
    expect(createResponse.status).toBe(201);
    const created = createResponse.body.data as RouteResource;

    const loadRequest = {
      expectedVersion: created.version,
      lines: [{ productId, quantity: '5.000' }],
    };
    expectForbidden(
      await authed(admin).put(`/api/v1/routes/${created.id}/load`).send(loadRequest),
      'ROLE_FORBIDDEN',
    );
    expectForbidden(
      await authed(anotherDriver).put(`/api/v1/routes/${created.id}/load`).send(loadRequest),
      'ROUTE_FORBIDDEN',
    );
    const draftResponse = await authed(assignedDriver)
      .put(`/api/v1/routes/${created.id}/load`)
      .send(loadRequest);
    expect(draftResponse.status).toBe(200);
    const loadVersion = (draftResponse.body.data as { version: number }).version;

    expectForbidden(
      await command(admin, `/api/v1/routes/${created.id}/load/confirmation`, {
        expectedVersion: loadVersion,
      }),
      'ROLE_FORBIDDEN',
    );
    expectForbidden(
      await command(anotherDriver, `/api/v1/routes/${created.id}/load/confirmation`, {
        expectedVersion: loadVersion,
      }),
      'ROUTE_FORBIDDEN',
    );
    const confirmation = await command(
      assignedDriver,
      `/api/v1/routes/${created.id}/load/confirmation`,
      { expectedVersion: loadVersion },
    );
    expect(confirmation.status).toBe(200);

    expectForbidden(
      await command(admin, `/api/v1/routes/${created.id}/start`, {
        expectedVersion: created.version,
      }),
      'ROLE_FORBIDDEN',
    );
    expectForbidden(
      await command(anotherDriver, `/api/v1/routes/${created.id}/start`, {
        expectedVersion: created.version,
      }),
      'ROUTE_FORBIDDEN',
    );
    const startResponse = await command(assignedDriver, `/api/v1/routes/${created.id}/start`, {
      expectedVersion: created.version,
    });
    expect(startResponse.status).toBe(200);
    const started = startResponse.body.data as RouteResource;

    expectForbidden(
      await command(admin, `/api/v1/routes/${created.id}/return`, {
        expectedVersion: started.version,
      }),
      'ROLE_FORBIDDEN',
    );
    expectForbidden(
      await command(anotherDriver, `/api/v1/routes/${created.id}/return`, {
        expectedVersion: started.version,
      }),
      'ROUTE_FORBIDDEN',
    );
    const returnResponse = await command(assignedDriver, `/api/v1/routes/${created.id}/return`, {
      expectedVersion: started.version,
    });
    expect(returnResponse.status).toBe(200);
    const returned = returnResponse.body.data as RouteResource;

    const reconciliationRequest = {
      expectedVersion: returned.version,
      lines: [
        {
          productId,
          physicalReturnQuantity: '4.000',
          differenceReason: 'One unit damaged',
        },
      ],
    };
    expectForbidden(
      await authed(assignedDriver)
        .put(`/api/v1/routes/${created.id}/reconciliation`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send(reconciliationRequest),
      'ROLE_FORBIDDEN',
    );
    expectForbidden(
      await authed(anotherDriver)
        .put(`/api/v1/routes/${created.id}/reconciliation`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send(reconciliationRequest),
      'ROLE_FORBIDDEN',
    );
    const reconciliation = await authed(admin)
      .put(`/api/v1/routes/${created.id}/reconciliation`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(reconciliationRequest);
    expect(reconciliation.status).toBe(200);

    expectForbidden(
      await command(assignedDriver, `/api/v1/routes/${created.id}/close`, {
        expectedVersion: returned.version,
      }),
      'ROLE_FORBIDDEN',
    );
    const closeResponse = await command(admin, `/api/v1/routes/${created.id}/close`, {
      expectedVersion: returned.version,
    });
    expect(closeResponse.status).toBe(200);
    expect(closeResponse.body.data).toMatchObject({ id: created.id, state: 'CLOSED' });

    const assignedDetail = await authed(assignedDriver).get(`/api/v1/routes/${created.id}`);
    expect(assignedDetail.status).toBe(200);
    expect(assignedDetail.body.data).toMatchObject({
      route: { id: created.id, state: 'CLOSED' },
      load: { state: 'CONFIRMED', lines: [{ productId, quantity: '5.000' }] },
      balances: [expect.objectContaining({ productId, quantity: '0.000' })],
      sales: [],
      reconciliation: {
        state: 'APPROVED',
        lines: [
          expect.objectContaining({
            productId,
            physicalReturnQuantity: '4.000',
            differenceQuantity: '1.000',
            differenceReason: 'One unit damaged',
          }),
        ],
      },
    });
    expect(
      assignedDetail.body.data.movements
        .map((movement: { operationType: string }) => movement.operationType)
        .sort(),
    ).toEqual(['NEGATIVE_ADJUSTMENT', 'ROUTE_LOAD', 'ROUTE_RETURN']);

    expectForbidden(
      await authed(anotherDriver).get(`/api/v1/routes/${created.id}`),
      'ROUTE_FORBIDDEN',
    );
    const anotherList = await authed(anotherDriver).get('/api/v1/routes');
    expect(anotherList.status).toBe(200);
    expect(anotherList.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
    const anotherFilteredList = await authed(anotherDriver).get(
      `/api/v1/routes?driverId=${assignedDriver.id}&state=CLOSED`,
    );
    expect(anotherFilteredList.status).toBe(200);
    expect(anotherFilteredList.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
    const assignedFilteredList = await authed(assignedDriver).get(
      `/api/v1/routes?driverId=${anotherDriver.id}&state=CLOSED`,
    );
    expect(assignedFilteredList.status).toBe(200);
    expect(
      assignedFilteredList.body.data.every(
        (route: { driverId: string }) => route.driverId === assignedDriver.id,
      ),
    ).toBe(true);
    const adminList = await authed(admin).get('/api/v1/routes');
    expect(adminList.status).toBe(200);
    expect(adminList.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, state: 'CLOSED' })]),
    );
  });
});

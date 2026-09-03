import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  SaleCancellationRequestSchema,
  SaleCreateRequestSchema,
  SaleQuoteRequestSchema,
} from '@warehouse/contracts';
import type { Express } from 'express';
import request from 'supertest';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import type { Environment } from '../../../src/config/env.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { createServer } from '../../../src/server.js';
import {
  createCustomerFixture,
  createCustomerPriceFixture,
  createEnRouteFixture,
  saleCommand,
} from '../../support/sales-factories.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('sales request and OpenAPI contracts', () => {
  const line = { productId: crypto.randomUUID(), quantity: '1.500' };

  it('requires a registered customer, route, exact quantities, and payment method', () => {
    const input = {
      clientOperationId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      routeId: crypto.randomUUID(),
      paymentMethod: 'CASH',
      lines: [line],
    };

    expect(SaleCreateRequestSchema.parse(input)).toEqual(input);
    expect(() => SaleCreateRequestSchema.parse({ ...input, paymentMethod: 'CREDIT' })).toThrow();
    expect(() =>
      SaleCreateRequestSchema.parse({ ...input, lines: [{ ...line, quantity: 1.5 }] }),
    ).toThrow();
  });

  it('keeps quotes advisory, requires cancellation reasons, and documents every sales route', async () => {
    expect(
      SaleQuoteRequestSchema.safeParse({
        customerId: crypto.randomUUID(),
        routeId: crypto.randomUUID(),
        lines: [line],
      }).success,
    ).toBe(true);
    expect(() => SaleCancellationRequestSchema.parse({ reason: ' ' })).toThrow();

    const openapi = await readFile(
      fileURLToPath(new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url)),
      'utf8',
    );
    expect(openapi).toContain('  /sales:');
    expect(openapi).toContain('  /sales/quote:');
    expect(openapi).toContain('  /sales/{saleId}:');
    expect(openapi).toContain('  /sales/{saleId}/cancellation:');
    expect(openapi).toContain('    SaleQuoteResponse:');
    expect(openapi).toContain('    SaleResponse:');
    expect(openapi).toContain('    SaleListResponse:');
  });
});

describe('sales HTTP contract', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let app: Express;
  let admin: Principal;
  let driver: Principal;
  let anotherDriver: Principal;
  let customerId: string;
  let productId: string;
  let driverRouteId: string;
  let anotherRouteId: string;
  let driverSaleId: string;
  let anotherSaleId: string;

  const env: Environment = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
    SESSION_SECRET: 'x'.repeat(32),
    APP_ORIGIN: 'https://warehouse.test',
    BUSINESS_TIMEZONE: 'America/Hermosillo',
    BUSINESS_CURRENCY: 'MXN',
    PORT: 3000,
    LOG_LEVEL: 'fatal',
    DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-sales-contract',
  };

  interface Principal {
    cookie: string;
    csrf: string;
    id: string;
  }

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
    };
  }

  async function confirm(principal: Principal, routeId: string, quantity = '1') {
    return authed(principal)
      .post('/api/v1/sales')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(saleCommand({ customerId, routeId, productId, quantity }));
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

    const seededDriver = await database
      .selectFrom('app_user')
      .select(['id', 'password_hash'])
      .where('username', '=', 'driver')
      .executeTakeFirstOrThrow();
    const secondDriver = await database
      .insertInto('app_user')
      .values({
        username: `driver-${crypto.randomUUID()}`,
        display_name: 'Second contract driver',
        password_hash: seededDriver.password_hash,
        role: 'DRIVER',
        active: true,
        archived_at: null,
      })
      .returning(['id', 'username'])
      .executeTakeFirstOrThrow();

    admin = await login('admin');
    driver = await login('driver');
    anotherDriver = await login(secondDriver.username);

    const unit = await database
      .insertInto('unit')
      .values({
        code: `UNIT-${crypto.randomUUID()}`,
        name: 'Bottle',
        quantity_scale: 3,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const category = await database
      .insertInto('category')
      .values({
        name: `Sodas ${crypto.randomUUID()}`,
        reporting_group: 'SODAS',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const product = await database
      .insertInto('product')
      .values({
        sku: `SALE-${crypto.randomUUID()}`,
        name: 'Contract cola',
        description: null,
        category_id: category.id,
        unit_id: unit.id,
        standard_unit_price: '12.3456',
        low_stock_threshold: '1.000',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    productId = product.id;
    const customer = await createCustomerFixture(database, 'SALES-CONTRACT');
    customerId = customer.id;
    await createCustomerPriceFixture(database, {
      customerId,
      productId,
      actorId: admin.id,
      unitPrice: '9.5000',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    });
    const origin = await database
      .selectFrom('location')
      .select('id')
      .where('code', '=', 'MAGDALENA')
      .executeTakeFirstOrThrow();
    const driverRoute = await createEnRouteFixture(database, {
      originLocationId: origin.id,
      driverId: driver.id,
      createdBy: admin.id,
    });
    const anotherRoute = await createEnRouteFixture(database, {
      originLocationId: origin.id,
      driverId: anotherDriver.id,
      createdBy: admin.id,
    });
    driverRouteId = driverRoute.route.id;
    anotherRouteId = anotherRoute.route.id;
    await database
      .insertInto('inventory_balance')
      .values([
        {
          stock_location_id: driverRoute.stockLocation.id,
          product_id: productId,
          quantity: '100.000',
        },
        {
          stock_location_id: anotherRoute.stockLocation.id,
          product_id: productId,
          quantity: '100.000',
        },
      ])
      .execute();

    const firstSale = await confirm(driver, driverRouteId);
    expect(firstSale.status).toBe(201);
    driverSaleId = (firstSale.body.data as { id: string }).id;
    const secondSale = await confirm(anotherDriver, anotherRouteId);
    expect(secondSale.status).toBe(201);
    anotherSaleId = (secondSale.body.data as { id: string }).id;
  }, 180_000);

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  it('quotes and confirms exact decimal sale data only for the assigned Driver', async () => {
    const quote = await authed(driver)
      .post('/api/v1/sales/quote')
      .send({
        customerId,
        routeId: driverRouteId,
        lines: [{ productId, quantity: '1.500' }],
      });
    expect(quote.status).toBe(200);
    expect(quote.body.data).toMatchObject({
      customerId,
      routeId: driverRouteId,
      currencyCode: 'MXN',
      total: '14.25',
    });
    expect(quote.body.data.lines[0]).toMatchObject({
      productId,
      quantity: '1.500',
      appliedPriceSource: 'CUSTOMER',
      unitPrice: '9.5000',
      lineAmount: '14.25',
      availableQuantity: '99.000',
      available: true,
    });
    for (const field of ['quantity', 'unitPrice', 'lineAmount', 'availableQuantity']) {
      expect(typeof quote.body.data.lines[0][field]).toBe('string');
    }

    const forbiddenRoute = await authed(driver)
      .post('/api/v1/sales/quote')
      .send({
        customerId,
        routeId: anotherRouteId,
        lines: [{ productId, quantity: '1' }],
      });
    expectProblem(forbiddenRoute, 403, 'ROUTE_FORBIDDEN');

    const invalidQuantity = await authed(driver)
      .post('/api/v1/sales/quote')
      .send({
        customerId,
        routeId: driverRouteId,
        lines: [{ productId, quantity: 1.5 }],
      });
    expectProblem(invalidQuantity, 422, 'VALIDATION_FAILED');

    const command = {
      ...saleCommand({ customerId, routeId: driverRouteId, productId, quantity: '2.000' }),
      paymentMethod: 'BANK_TRANSFER' as const,
    };
    const confirmed = await authed(driver)
      .post('/api/v1/sales')
      .set('Idempotency-Key', crypto.randomUUID())
      .send(command);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data).toMatchObject({
      clientOperationId: command.clientOperationId,
      customerId,
      driverId: driver.id,
      routeId: driverRouteId,
      paymentMethod: 'BANK_TRANSFER',
      currencyCode: 'MXN',
      subtotal: '19.00',
      total: '19.00',
      roundingMode: 'HALF_AWAY_FROM_ZERO',
      ticketNumber: expect.any(String),
    });
    expect(confirmed.body.data.lines[0]).toMatchObject({
      productId,
      productName: 'Contract cola',
      reportingGroup: 'SODAS',
      unitCode: expect.any(String),
      quantity: '2.000',
      unitPrice: '9.5000',
      lineAmount: '19.00',
    });
  });

  it('scopes list, filters, and direct sale history while administrators see all sales', async () => {
    const ownList = await authed(driver).get('/api/v1/sales');
    expect(ownList.status).toBe(200);
    expect(ownList.body.page).toEqual({ hasNextPage: false, nextCursor: null });
    expect(ownList.body.data.length).toBeGreaterThanOrEqual(1);
    expect(
      ownList.body.data.every((sale: { driverId: string }) => sale.driverId === driver.id),
    ).toBe(true);
    expect(ownList.body.data.map((sale: { id: string }) => sale.id)).not.toContain(anotherSaleId);
    expect(ownList.body.data[0]).toEqual(
      expect.objectContaining({
        saleNumber: expect.any(String),
        paymentMethod: expect.stringMatching(/^(CASH|BANK_TRANSFER|CARD)$/),
        total: expect.stringMatching(/^\d+\.\d{2}$/),
        completedAt: expect.any(String),
      }),
    );

    const deniedFilter = await authed(driver).get(`/api/v1/sales?driverId=${anotherDriver.id}`);
    expectProblem(deniedFilter, 403, 'SALE_HISTORY_FORBIDDEN');

    const deniedDirect = await authed(driver).get(`/api/v1/sales/${anotherSaleId}`);
    expectProblem(deniedDirect, 403, 'SALE_FORBIDDEN');

    const ownDetail = await authed(driver).get(`/api/v1/sales/${driverSaleId}`);
    expect(ownDetail.status).toBe(200);
    expect(ownDetail.body.data).toEqual(
      expect.objectContaining({
        id: driverSaleId,
        driverId: driver.id,
        ticketNumber: expect.any(String),
        lines: expect.arrayContaining([
          expect.objectContaining({
            sequence: 1,
            productName: 'Contract cola',
            categoryName: expect.any(String),
            reportingGroup: 'SODAS',
            unitCode: expect.any(String),
            unitPrice: '9.5000',
          }),
        ]),
      }),
    );

    const adminList = await authed(admin).get('/api/v1/sales');
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.map((sale: { id: string }) => sale.id)).toEqual(
      expect.arrayContaining([driverSaleId, anotherSaleId]),
    );

    const filtered = await authed(admin).get(`/api/v1/sales?driverId=${anotherDriver.id}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.length).toBeGreaterThanOrEqual(1);
    expect(
      filtered.body.data.every((sale: { driverId: string }) => sale.driverId === anotherDriver.id),
    ).toBe(true);

    const adminDetail = await authed(admin).get(`/api/v1/sales/${anotherSaleId}`);
    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.data.driverId).toBe(anotherDriver.id);
  });

  it('allows only an Administrator to cancel once and returns preserved sale detail', async () => {
    const denied = await authed(driver)
      .post(`/api/v1/sales/${driverSaleId}/cancellation`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'Driver cannot cancel' });
    expectProblem(denied, 403, 'ROLE_FORBIDDEN');

    const missingReason = await authed(admin)
      .post(`/api/v1/sales/${driverSaleId}/cancellation`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reason: ' ' });
    expectProblem(missingReason, 422, 'VALIDATION_FAILED');

    const cancelled = await authed(admin)
      .post(`/api/v1/sales/${driverSaleId}/cancellation`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'Customer returned the order' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toEqual(
      expect.objectContaining({
        id: driverSaleId,
        status: 'CANCELLED',
        cancellationReason: 'Customer returned the order',
        cancelledBy: admin.id,
        ticketNumber: expect.any(String),
        lines: expect.any(Array),
      }),
    );

    const repeated = await authed(admin)
      .post(`/api/v1/sales/${driverSaleId}/cancellation`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ reason: 'Duplicate cancellation' });
    expectProblem(repeated, 409, 'SALE_ALREADY_CANCELLED');
  });

  it('returns RFC 9457 Problem Details for missing and invalid sales requests', async () => {
    const missing = await authed(admin).get(`/api/v1/sales/${crypto.randomUUID()}`);
    expectProblem(missing, 404, 'SALE_NOT_FOUND');

    const missingKey = await authed(driver)
      .post('/api/v1/sales')
      .send(saleCommand({ customerId, routeId: driverRouteId, productId }));
    expectProblem(missingKey, 422, 'IDEMPOTENCY_KEY_INVALID');

    const unauthenticated = await request(app).get('/api/v1/sales');
    expectProblem(unauthenticated, 401, 'AUTHENTICATION_REQUIRED');
  });
});

function expectProblem(
  response: { status: number; type: string; body: Record<string, unknown> },
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  expect(response.type).toBe('application/problem+json');
  expect(response.body).toEqual(
    expect.objectContaining({
      type: expect.stringContaining('/problems/'),
      title: expect.any(String),
      status,
      code,
      instance: expect.stringContaining('/api/v1/'),
      requestId: expect.any(String),
    }),
  );
  expect(JSON.stringify(response.body)).not.toMatch(/stack|password_hash|postgres/i);
}

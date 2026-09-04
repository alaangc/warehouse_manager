import {
  CustomerPriceDeactivateSchema,
  CustomerPriceWriteSchema,
  CustomerUpdateSchema,
  CustomerWriteSchema,
} from '@warehouse/contracts';
import type { Express } from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import type { Environment } from '../../../src/config/env.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { createServer } from '../../../src/server.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('customer contracts', () => {
  it('validates customer creation and optimistic archival', () => {
    expect(CustomerWriteSchema.parse({ displayName: 'Customer', city: 'Caborca' })).toEqual({
      displayName: 'Customer',
      city: 'Caborca',
    });
    expect(() =>
      CustomerUpdateSchema.parse({
        expectedVersion: 1,
        displayName: '',
        city: 'Caborca',
        active: false,
      }),
    ).toThrow();
  });

  it('keeps exact prices and ordered validity intervals', async () => {
    const validFrom = new Date().toISOString();
    expect(
      CustomerPriceWriteSchema.parse({
        productId: crypto.randomUUID(),
        unitPrice: '12.3456',
        validFrom,
      }),
    ).toMatchObject({ unitPrice: '12.3456' });
    expect(() =>
      CustomerPriceWriteSchema.parse({
        productId: crypto.randomUUID(),
        unitPrice: 12.3456,
        validFrom,
      }),
    ).toThrow();
    expect(() => CustomerPriceDeactivateSchema.parse({ reason: ' ' })).toThrow();

    const openapi = await readFile(
      fileURLToPath(new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url)),
      'utf8',
    );
    expect(openapi).toContain('operationId: listCustomers');
    expect(openapi).toContain('operationId: createCustomer');
    expect(openapi).toContain('operationId: getCustomer');
    expect(openapi).toContain('operationId: updateCustomer');
    expect(openapi).toContain('operationId: listCustomerPrices');
    expect(openapi).toContain('operationId: createCustomerPrice');
    expect(openapi).toContain('operationId: deactivateCustomerPrice');
    expect(openapi).toContain('operationId: listCustomerSales');
  });
});

describe('customer HTTP contract', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let app: Express;
  let admin: Principal;
  let driver: Principal;
  let productId: string;

  const env: Environment = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
    SESSION_SECRET: 'x'.repeat(32),
    APP_ORIGIN: 'https://warehouse.test',
    BUSINESS_TIMEZONE: 'America/Hermosillo',
    BUSINESS_CURRENCY: 'MXN',
    PORT: 3000,
    LOG_LEVEL: 'fatal',
    DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-customer-contract',
  };

  interface Principal {
    cookie: string;
    csrf: string;
    id: string;
  }

  interface CustomerResource {
    id: string;
    customerNumber: string;
    displayName: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string;
    notes: string | null;
    active: boolean;
    version: number;
  }

  async function login(username: string): Promise<Principal> {
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
    return {
      cookie: cookie.split(';')[0]!,
      csrf: String(csrf),
      id: (response.body.data as { id: string }).id,
    };
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
      patch: (url: string) => decorate(base.patch(url)),
    };
  }

  function customerPayload(suffix = crypto.randomUUID()) {
    return {
      displayName: `Customer ${suffix}`,
      contactName: `Contact ${suffix}`,
      phone: '+52 631 000 0000',
      email: `${suffix}@example.com`,
      address: `Address ${suffix}`,
      city: 'Magdalena',
      notes: `Notes ${suffix}`,
    };
  }

  async function createCustomer(suffix = crypto.randomUUID()): Promise<CustomerResource> {
    const response = await authed(admin).post('/api/v1/customers').send(customerPayload(suffix));
    expect(response.status).toBe(201);
    return response.body.data as CustomerResource;
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

    const unit = await database
      .insertInto('unit')
      .values({
        code: `CUSTOMER-${crypto.randomUUID()}`,
        name: 'Customer contract unit',
        quantity_scale: 3,
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const category = await database
      .insertInto('category')
      .values({
        name: `Customer contract ${crypto.randomUUID()}`,
        reporting_group: 'OTHER',
        archived_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    productId = (
      await database
        .insertInto('product')
        .values({
          sku: `CUSTOMER-${crypto.randomUUID()}`,
          name: 'Customer contract product',
          description: null,
          category_id: category.id,
          unit_id: unit.id,
          standard_unit_price: '15.0000',
          low_stock_threshold: '0.000',
          archived_at: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  }, 180_000);

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  it('creates, reads, searches, updates, archives, and reactivates customers', async () => {
    const suffix = crypto.randomUUID();
    const created = await createCustomer(suffix);
    expect(created).toMatchObject({
      displayName: `Customer ${suffix}`,
      contactName: `Contact ${suffix}`,
      email: `${suffix}@example.com`,
      city: 'Magdalena',
      active: true,
      version: 1,
    });
    expect(created.customerNumber).toMatch(/^C-/);

    const detail = await authed(admin).get(`/api/v1/customers/${created.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toEqual(created);

    const byName = await authed(admin).get(`/api/v1/customers?search=${suffix}`);
    expect(byName.status).toBe(200);
    expect(byName.body.data.map((customer: CustomerResource) => customer.id)).toContain(created.id);
    const byNumber = await authed(admin).get(
      `/api/v1/customers?search=${encodeURIComponent(created.customerNumber)}`,
    );
    expect(byNumber.body.data.map((customer: CustomerResource) => customer.id)).toContain(
      created.id,
    );

    const updated = await authed(admin)
      .patch(`/api/v1/customers/${created.id}`)
      .send({
        ...customerPayload(suffix),
        displayName: `Updated ${suffix}`,
        expectedVersion: created.version,
        active: true,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      displayName: `Updated ${suffix}`,
      active: true,
      version: 2,
    });

    const stale = await authed(admin)
      .patch(`/api/v1/customers/${created.id}`)
      .send({
        ...customerPayload(suffix),
        expectedVersion: created.version,
        active: true,
      });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('OPTIMISTIC_CONFLICT');

    const archiveWithoutReason = await authed(admin)
      .patch(`/api/v1/customers/${created.id}`)
      .send({
        ...customerPayload(suffix),
        displayName: `Updated ${suffix}`,
        expectedVersion: 2,
        active: false,
      });
    expect(archiveWithoutReason.status).toBe(422);
    expect(archiveWithoutReason.body.code).toBe('ARCHIVE_REASON_REQUIRED');

    const archived = await authed(admin)
      .patch(`/api/v1/customers/${created.id}`)
      .send({
        ...customerPayload(suffix),
        displayName: `Updated ${suffix}`,
        expectedVersion: 2,
        active: false,
        reason: 'Customer requested archival',
      });
    expect(archived.status).toBe(200);
    expect(archived.body.data).toMatchObject({ active: false, version: 3 });
    const archivedSearch = await authed(admin).get(
      `/api/v1/customers?search=${suffix}&active=false`,
    );
    expect(archivedSearch.body.data.map((customer: CustomerResource) => customer.id)).toContain(
      created.id,
    );

    const reactivated = await authed(admin)
      .patch(`/api/v1/customers/${created.id}`)
      .send({
        ...customerPayload(suffix),
        displayName: `Updated ${suffix}`,
        expectedVersion: 3,
        active: true,
      });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.data).toMatchObject({ active: true, version: 4 });
  });

  it('returns a safe active-only Driver projection and denies protected changes', async () => {
    const active = await createCustomer(`driver-visible-${crypto.randomUUID()}`);
    const archivedSource = await createCustomer(`driver-hidden-${crypto.randomUUID()}`);
    const archived = await authed(admin)
      .patch(`/api/v1/customers/${archivedSource.id}`)
      .send({
        ...customerPayload('driver-hidden'),
        expectedVersion: archivedSource.version,
        active: false,
        reason: 'No longer active',
      });
    expect(archived.status).toBe(200);

    const listed = await authed(driver).get('/api/v1/customers?active=false');
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((customer: CustomerResource) => customer.id === active.id)).toBe(
      true,
    );
    expect(
      listed.body.data.some((customer: CustomerResource) => customer.id === archivedSource.id),
    ).toBe(false);

    const detail = await authed(driver).get(`/api/v1/customers/${active.id}`);
    expect(detail.status).toBe(200);
    expect(Object.keys(detail.body.data).sort()).toEqual(
      ['active', 'city', 'customerNumber', 'displayName', 'id', 'version'].sort(),
    );
    const hidden = await authed(driver).get(`/api/v1/customers/${archivedSource.id}`);
    expect(hidden.status).toBe(404);

    const createDenied = await authed(driver).post('/api/v1/customers').send(customerPayload());
    expect(createDenied.status).toBe(403);
    const updateDenied = await authed(driver)
      .patch(`/api/v1/customers/${active.id}`)
      .send({ ...customerPayload(), expectedVersion: active.version, active: true });
    expect(updateDenied.status).toBe(403);
    expect((await authed(driver).get(`/api/v1/customers/${active.id}`)).body.data.version).toBe(
      active.version,
    );
  });

  it('creates, lists, rejects overlapping, deactivates, and replaces exact customer prices', async () => {
    const customer = await createCustomer(`price-${crypto.randomUUID()}`);
    const priceInput = {
      productId,
      unitPrice: '12.3456',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2027-01-01T00:00:00.000Z',
    };
    const created = await authed(admin)
      .post(`/api/v1/customers/${customer.id}/prices`)
      .send(priceInput);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      customerId: customer.id,
      productId,
      unitPrice: '12.3456',
      active: true,
    });

    const listed = await authed(admin).get(`/api/v1/customers/${customer.id}/prices`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([created.body.data]);

    const overlap = await authed(admin)
      .post(`/api/v1/customers/${customer.id}/prices`)
      .send({
        ...priceInput,
        unitPrice: '11.0000',
        validFrom: '2026-06-01T00:00:00.000Z',
        validTo: null,
      });
    expect(overlap.status).toBe(409);
    expect(overlap.body.code).toBe('CUSTOMER_PRICE_OVERLAP');

    const missingReason = await authed(admin)
      .post(`/api/v1/customer-prices/${created.body.data.id}/deactivation`)
      .send({ reason: ' ' });
    expect(missingReason.status).toBe(422);
    const deactivated = await authed(admin)
      .post(`/api/v1/customer-prices/${created.body.data.id}/deactivation`)
      .send({ reason: 'Negotiated period replaced' });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.active).toBe(false);

    const replacement = await authed(admin)
      .post(`/api/v1/customers/${customer.id}/prices`)
      .send({ ...priceInput, unitPrice: '10.5000' });
    expect(replacement.status).toBe(201);
    expect(replacement.body.data.unitPrice).toBe('10.5000');

    const driverList = await authed(driver).get(`/api/v1/customers/${customer.id}/prices`);
    expect(driverList.status).toBe(403);
    const driverCreate = await authed(driver)
      .post(`/api/v1/customers/${customer.id}/prices`)
      .send(priceInput);
    expect(driverCreate.status).toBe(403);
    const driverDeactivate = await authed(driver)
      .post(`/api/v1/customer-prices/${replacement.body.data.id}/deactivation`)
      .send({ reason: 'Forbidden' });
    expect(driverDeactivate.status).toBe(403);
  });

  it('preserves Administrator purchase history after archival and denies it to Drivers', async () => {
    const scenario = await createSaleScenario(database, { stockQuantity: '3.000' });
    const sale = await new SaleService(database).confirm(
      saleCommand({
        customerId: scenario.customer.id,
        routeId: scenario.route.id,
        productId: scenario.product.id,
        quantity: '1.000',
      }),
      {
        actorId: scenario.driver.id,
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      },
    );

    const archived = await authed(admin).patch(`/api/v1/customers/${scenario.customer.id}`).send({
      displayName: scenario.customer.display_name,
      contactName: scenario.customer.contact_name,
      phone: scenario.customer.phone,
      email: scenario.customer.email,
      address: scenario.customer.address,
      city: scenario.customer.city,
      notes: scenario.customer.notes,
      expectedVersion: scenario.customer.version,
      active: false,
      reason: 'Archived after completed sale',
    });
    expect(archived.status).toBe(200);

    const history = await authed(admin).get(`/api/v1/customers/${scenario.customer.id}/sales`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({
      id: sale.id,
      saleNumber: sale.saleNumber,
      customerId: scenario.customer.id,
      driverId: scenario.driver.id,
      routeId: scenario.route.id,
      paymentMethod: 'CASH',
      total: sale.total,
      status: 'COMPLETED',
    });
    expect(history.body.page).toEqual({ hasNextPage: false, nextCursor: null });

    const driverHistory = await authed(driver).get(
      `/api/v1/customers/${scenario.customer.id}/sales`,
    );
    expect(driverHistory.status).toBe(403);
  });
});

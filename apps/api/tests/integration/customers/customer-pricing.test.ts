import type { Express } from 'express';
import { sql } from 'kysely';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { Test } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import type { Environment } from '../../../src/config/env.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { CustomerPriceRepository } from '../../../src/modules/customers/customer-price-repository.js';
import { CustomerPriceService } from '../../../src/modules/customers/customer-price-service.js';
import { CustomerService } from '../../../src/modules/customers/customer-service.js';
import { PricingService } from '../../../src/modules/sales/pricing-service.js';
import { createServer } from '../../../src/server.js';
import { createSaleScenario } from '../../support/sales-factories.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

interface Principal {
  cookie: string;
  csrf: string;
}

describe('customer and special-price lifecycle', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let databaseReady = false;
  let app: Express;
  let adminId: string;
  let driver: Principal;

  const env: Environment = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
    SESSION_SECRET: 'x'.repeat(32),
    APP_ORIGIN: 'https://warehouse.test',
    BUSINESS_TIMEZONE: 'America/Hermosillo',
    BUSINESS_CURRENCY: 'MXN',
    PORT: 3000,
    LOG_LEVEL: 'fatal',
    DOCUMENT_STORAGE_PATH: '/tmp/warehouse-documents-customer-pricing',
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
      post: (path: string) => decorate(agent.post(path)),
      patch: (path: string) => decorate(agent.patch(path)),
    };
  }

  async function clearAuditFailure() {
    await sql`drop trigger if exists test_reject_customer_audit on audit_event`.execute(database);
    await sql`drop function if exists test_reject_customer_audit_write()`.execute(database);
  }

  async function injectAuditFailure() {
    await clearAuditFailure();
    await sql`
      create function test_reject_customer_audit_write() returns trigger language plpgsql as $$
      begin
        raise exception 'injected customer audit failure';
      end $$;
      create trigger test_reject_customer_audit before insert on audit_event
      for each row execute function test_reject_customer_audit_write()
    `.execute(database);
  }

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    databaseReady = true;
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
    adminId = (
      await database
        .selectFrom('app_user')
        .select('id')
        .where('username', '=', 'admin')
        .executeTakeFirstOrThrow()
    ).id;
    env.DATABASE_URL = container.connectionString;
    app = createServer(env, { database });
    driver = await login('driver');
  }, 120_000);

  afterAll(async () => {
    if (databaseReady) {
      await clearAuditFailure();
      await database.destroy();
    }
    await container?.container.stop();
  });

  it('creates, deactivates, and replaces an exact price with standard fallback', async () => {
    const fixture = await createSaleScenario(database, { standardUnitPrice: '20.0000' });
    const prices = new CustomerPriceService(database);
    const validFrom = new Date(Date.now() - 60_000).toISOString();
    const quotedAt = new Date();

    const standardQuote = await database
      .transaction()
      .execute((transaction) =>
        new PricingService(transaction).price(
          fixture.customer.id,
          fixture.route.id,
          [{ productId: fixture.product.id, quantity: '2.000' }],
          quotedAt,
        ),
      );
    expect(standardQuote.lines[0]).toMatchObject({
      appliedPriceSource: 'STANDARD',
      customerPriceId: null,
      unitPrice: '20.0000',
      lineAmount: '40.00',
    });

    const original = await prices.create(
      fixture.customer.id,
      { productId: fixture.product.id, unitPrice: '17.2500', validFrom },
      adminId,
      crypto.randomUUID(),
    );
    await expect(
      prices.create(
        fixture.customer.id,
        { productId: fixture.product.id, unitPrice: '16.0000', validFrom },
        adminId,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: '23P01' });

    const specialQuote = await database
      .transaction()
      .execute((transaction) =>
        new PricingService(transaction).price(
          fixture.customer.id,
          fixture.route.id,
          [{ productId: fixture.product.id, quantity: '2.000' }],
          quotedAt,
        ),
      );
    expect(specialQuote.lines[0]).toMatchObject({
      appliedPriceSource: 'CUSTOMER',
      customerPriceId: original.id,
      unitPrice: '17.2500',
      lineAmount: '34.50',
    });

    await prices.deactivate(original.id, 'Replace negotiated price', adminId, crypto.randomUUID());
    const fallbackQuote = await database
      .transaction()
      .execute((transaction) =>
        new PricingService(transaction).price(
          fixture.customer.id,
          fixture.route.id,
          [{ productId: fixture.product.id, quantity: '2.000' }],
          quotedAt,
        ),
      );
    expect(fallbackQuote.lines[0]).toMatchObject({
      appliedPriceSource: 'STANDARD',
      customerPriceId: null,
      unitPrice: '20.0000',
    });

    const replacement = await prices.create(
      fixture.customer.id,
      { productId: fixture.product.id, unitPrice: '16.5000', validFrom },
      adminId,
      crypto.randomUUID(),
    );
    const effective = await database
      .transaction()
      .execute((transaction) =>
        new CustomerPriceRepository(transaction).findEffective(
          fixture.customer.id,
          fixture.product.id,
          quotedAt,
        ),
      );
    expect(effective).toMatchObject({ id: replacement.id, unit_price: '16.5000', active: true });

    const history = await database
      .selectFrom('customer_price')
      .select(['id', 'unit_price', 'active'])
      .where('customer_id', '=', fixture.customer.id)
      .where('product_id', '=', fixture.product.id)
      .orderBy('created_at')
      .execute();
    expect(history).toEqual([
      { id: original.id, unit_price: '17.2500', active: false },
      { id: replacement.id, unit_price: '16.5000', active: true },
    ]);
  });

  it('archives customers, rejects inactive catalogs, and detects optimistic conflicts', async () => {
    const customers = new CustomerService(database);
    const prices = new CustomerPriceService(database);
    const customer = await customers.create(
      { displayName: `Archive ${crypto.randomUUID()}`, city: 'Magdalena' },
      adminId,
      crypto.randomUUID(),
    );
    const fixture = await createSaleScenario(database);

    await expect(
      Promise.resolve().then(() =>
        customers.update(
          customer.id,
          {
            expectedVersion: customer.version,
            displayName: customer.display_name,
            city: customer.city,
            active: false,
          },
          adminId,
          crypto.randomUUID(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'ARCHIVE_REASON_REQUIRED' });

    const archived = await customers.update(
      customer.id,
      {
        expectedVersion: customer.version,
        displayName: customer.display_name,
        city: customer.city,
        active: false,
        reason: 'No longer trading',
      },
      adminId,
      crypto.randomUUID(),
    );
    expect(archived).toMatchObject({ active: false, version: customer.version + 1 });
    expect(archived.archived_at).toBeInstanceOf(Date);

    await expect(
      prices.create(
        customer.id,
        {
          productId: fixture.product.id,
          unitPrice: '8.0000',
          validFrom: new Date().toISOString(),
        },
        adminId,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await expect(
      customers.update(
        customer.id,
        {
          expectedVersion: customer.version,
          displayName: customer.display_name,
          city: customer.city,
          active: true,
        },
        adminId,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'OPTIMISTIC_CONFLICT' });

    await database
      .updateTable('product')
      .set({ active: false, archived_at: new Date() })
      .where('id', '=', fixture.product.id)
      .executeTakeFirstOrThrow();
    await expect(
      prices.create(
        fixture.customer.id,
        {
          productId: fixture.product.id,
          unitPrice: '8.0000',
          validFrom: new Date().toISOString(),
        },
        adminId,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('enforces Administrator-only customer and price mutations at the API boundary', async () => {
    const fixture = await createSaleScenario(database);
    const auditCountBefore = await database
      .selectFrom('audit_event')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();

    const customerResponse = await authed(driver)
      .patch(`/api/v1/customers/${fixture.customer.id}`)
      .send({
        expectedVersion: fixture.customer.version,
        displayName: 'Forbidden edit',
        city: fixture.customer.city,
        active: true,
      });
    const priceResponse = await authed(driver)
      .post(`/api/v1/customers/${fixture.customer.id}/prices`)
      .send({
        productId: fixture.product.id,
        unitPrice: '1.0000',
        validFrom: new Date().toISOString(),
      });

    expect(customerResponse).toMatchObject({ status: 403 });
    expect(customerResponse.body).toMatchObject({ code: 'ROLE_FORBIDDEN' });
    expect(priceResponse).toMatchObject({ status: 403 });
    expect(priceResponse.body).toMatchObject({ code: 'ROLE_FORBIDDEN' });
    const unchangedCustomer = await database
      .selectFrom('customer')
      .select(['display_name', 'version'])
      .where('id', '=', fixture.customer.id)
      .executeTakeFirstOrThrow();
    expect(unchangedCustomer).toEqual({
      display_name: fixture.customer.display_name,
      version: fixture.customer.version,
    });
    expect(
      await database
        .selectFrom('customer_price')
        .select('id')
        .where('customer_id', '=', fixture.customer.id)
        .execute(),
    ).toHaveLength(0);
    const auditCountAfter = await database
      .selectFrom('audit_event')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow();
    expect(auditCountAfter.count).toBe(auditCountBefore.count);
  });

  it('records actor, request, before/after values, and reasons for customer and price changes', async () => {
    const customers = new CustomerService(database);
    const prices = new CustomerPriceService(database);
    const customerCreateRequest = crypto.randomUUID();
    const customerArchiveRequest = crypto.randomUUID();
    const priceCreateRequest = crypto.randomUUID();
    const priceDeactivateRequest = crypto.randomUUID();
    const customer = await customers.create(
      { displayName: `Audited ${crypto.randomUUID()}`, city: 'Caborca' },
      adminId,
      customerCreateRequest,
    );
    const fixture = await createSaleScenario(database);
    const price = await prices.create(
      customer.id,
      {
        productId: fixture.product.id,
        unitPrice: '12.3456',
        validFrom: new Date(Date.now() - 1_000).toISOString(),
      },
      adminId,
      priceCreateRequest,
    );
    const archived = await customers.update(
      customer.id,
      {
        expectedVersion: customer.version,
        displayName: customer.display_name,
        city: customer.city,
        active: false,
        reason: 'Customer requested closure',
      },
      adminId,
      customerArchiveRequest,
    );
    await prices.deactivate(price.id, 'Agreement expired', adminId, priceDeactivateRequest);

    const events = await database
      .selectFrom('audit_event')
      .selectAll()
      .where('entity_id', 'in', [customer.id, price.id])
      .orderBy('occurred_at')
      .execute();
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      actor_id: adminId,
      action: 'CATALOG_CHANGED',
      entity_type: 'CUSTOMER',
      entity_id: customer.id,
      request_id: customerCreateRequest,
      before_values: null,
      after_values: {
        customerNumber: customer.customer_number,
        displayName: customer.display_name,
      },
    });
    expect(events[1]).toMatchObject({
      actor_id: adminId,
      entity_type: 'CUSTOMER_PRICE',
      entity_id: price.id,
      request_id: priceCreateRequest,
      after_values: {
        customerId: customer.id,
        productId: fixture.product.id,
        unitPrice: '12.3456',
      },
    });
    expect(events[2]).toMatchObject({
      actor_id: adminId,
      entity_type: 'CUSTOMER',
      entity_id: customer.id,
      reason: 'Customer requested closure',
      request_id: customerArchiveRequest,
      before_values: { active: true, version: customer.version },
      after_values: { active: false, version: archived.version },
    });
    expect(events[3]).toMatchObject({
      actor_id: adminId,
      entity_type: 'CUSTOMER_PRICE',
      entity_id: price.id,
      reason: 'Agreement expired',
      request_id: priceDeactivateRequest,
      before_values: { active: true, unitPrice: '12.3456' },
      after_values: { active: false },
    });
  });

  it('rolls back customer and price writes when their audit insertion fails', async () => {
    const customers = new CustomerService(database);
    const prices = new CustomerPriceService(database);
    const failedCustomerName = `Rollback ${crypto.randomUUID()}`;

    try {
      await injectAuditFailure();
      await expect(
        customers.create(
          { displayName: failedCustomerName, city: 'Magdalena' },
          adminId,
          crypto.randomUUID(),
        ),
      ).rejects.toThrow('injected customer audit failure');
    } finally {
      await clearAuditFailure();
    }
    expect(
      await database
        .selectFrom('customer')
        .select('id')
        .where('display_name', '=', failedCustomerName)
        .executeTakeFirst(),
    ).toBeUndefined();

    const fixture = await createSaleScenario(database);
    const failedUnitPrice = '6.7890';
    try {
      await injectAuditFailure();
      await expect(
        prices.create(
          fixture.customer.id,
          {
            productId: fixture.product.id,
            unitPrice: failedUnitPrice,
            validFrom: new Date(Date.now() - 1_000).toISOString(),
          },
          adminId,
          crypto.randomUUID(),
        ),
      ).rejects.toThrow('injected customer audit failure');
    } finally {
      await clearAuditFailure();
    }
    expect(
      await database
        .selectFrom('customer_price')
        .select('id')
        .where('customer_id', '=', fixture.customer.id)
        .where('product_id', '=', fixture.product.id)
        .where('unit_price', '=', failedUnitPrice)
        .executeTakeFirst(),
    ).toBeUndefined();

    const persisted = await prices.create(
      fixture.customer.id,
      {
        productId: fixture.product.id,
        unitPrice: '7.0000',
        validFrom: new Date(Date.now() - 1_000).toISOString(),
      },
      adminId,
      crypto.randomUUID(),
    );
    const auditCountBefore = await database
      .selectFrom('audit_event')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('entity_id', '=', persisted.id)
      .executeTakeFirstOrThrow();
    try {
      await injectAuditFailure();
      await expect(
        prices.deactivate(persisted.id, 'This must roll back', adminId, crypto.randomUUID()),
      ).rejects.toThrow('injected customer audit failure');
    } finally {
      await clearAuditFailure();
    }
    const priceAfterFailure = await database
      .selectFrom('customer_price')
      .select(['active', 'unit_price'])
      .where('id', '=', persisted.id)
      .executeTakeFirstOrThrow();
    expect(priceAfterFailure).toEqual({ active: true, unit_price: '7.0000' });
    const auditCountAfter = await database
      .selectFrom('audit_event')
      .select(({ fn }) => fn.countAll<string>().as('count'))
      .where('entity_id', '=', persisted.id)
      .executeTakeFirstOrThrow();
    expect(auditCountAfter.count).toBe(auditCountBefore.count);
  });
});

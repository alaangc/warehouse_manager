import type { AppDatabase } from '../../src/db/database.js';

export async function createCustomerFixture(
  database: AppDatabase,
  suffix = crypto.randomUUID(),
  active = true,
) {
  return database
    .insertInto('customer')
    .values({
      customer_number: `C-${suffix}`,
      display_name: `Customer ${suffix}`,
      contact_name: null,
      phone: null,
      email: null,
      address: null,
      city: 'Magdalena',
      notes: null,
      active,
      archived_at: active ? null : new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function createCustomerPriceFixture(
  database: AppDatabase,
  input: {
    customerId: string;
    productId: string;
    actorId: string;
    unitPrice?: string;
    validFrom?: Date;
    validTo?: Date | null;
  },
) {
  return database
    .insertInto('customer_price')
    .values({
      customer_id: input.customerId,
      product_id: input.productId,
      created_by: input.actorId,
      unit_price: input.unitPrice ?? '9.5000',
      valid_from: input.validFrom ?? new Date(),
      valid_to: input.validTo ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function createEnRouteFixture(
  database: AppDatabase,
  input: { originLocationId: string; driverId: string; createdBy: string },
) {
  const vehicle = await database
    .insertInto('vehicle')
    .values({
      code: `V-${crypto.randomUUID()}`,
      name: 'Route test vehicle',
      registration: null,
      archived_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const route = await database
    .insertInto('route')
    .values({
      route_number: `R-${crypto.randomUUID()}`,
      state: 'EN_ROUTE',
      origin_location_id: input.originLocationId,
      driver_id: input.driverId,
      vehicle_id: vehicle.id,
      business_date: '2026-08-27',
      created_by: input.createdBy,
      started_at: new Date(),
      returned_at: null,
      closed_at: null,
      closed_by: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const stockLocation = await database
    .insertInto('stock_location')
    .values({ kind: 'ROUTE', branch_id: null, route_id: route.id })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { vehicle, route, stockLocation };
}

export function saleCommand(input: {
  customerId: string;
  routeId: string;
  productId: string;
  quantity?: string;
}) {
  return {
    clientOperationId: crypto.randomUUID(),
    customerId: input.customerId,
    routeId: input.routeId,
    paymentMethod: 'CASH' as const,
    lines: [{ productId: input.productId, quantity: input.quantity ?? '1' }],
  };
}

export async function createSaleScenario(
  database: AppDatabase,
  input: { stockQuantity?: string; standardUnitPrice?: string } = {},
) {
  const admin = await database
    .selectFrom('app_user')
    .select('id')
    .where('username', '=', 'admin')
    .executeTakeFirstOrThrow();
  const seededDriver = await database
    .selectFrom('app_user')
    .select('password_hash')
    .where('username', '=', 'driver')
    .executeTakeFirstOrThrow();
  const driver = await database
    .insertInto('app_user')
    .values({
      username: `sale-driver-${crypto.randomUUID()}`,
      display_name: 'Sale integration driver',
      password_hash: seededDriver.password_hash,
      role: 'DRIVER',
      active: true,
      archived_at: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const unit = await database
    .insertInto('unit')
    .values({
      code: `SALE-${crypto.randomUUID()}`,
      name: 'Sale test unit',
      quantity_scale: 3,
      archived_at: null,
    })
    .returning(['id', 'code'])
    .executeTakeFirstOrThrow();
  const category = await database
    .insertInto('category')
    .values({
      name: `Sale category ${crypto.randomUUID()}`,
      reporting_group: 'SODAS',
      archived_at: null,
    })
    .returning(['id', 'name'])
    .executeTakeFirstOrThrow();
  const product = await database
    .insertInto('product')
    .values({
      sku: `SALE-${crypto.randomUUID()}`,
      name: 'Sale integration product',
      description: null,
      category_id: category.id,
      unit_id: unit.id,
      standard_unit_price: input.standardUnitPrice ?? '4.2500',
      low_stock_threshold: '1.000',
      archived_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const customer = await createCustomerFixture(database);
  const origin = await database
    .selectFrom('location')
    .innerJoin('stock_location', 'stock_location.branch_id', 'location.id')
    .select(['location.id', 'stock_location.id as stockLocationId'])
    .where('location.code', '=', 'MAGDALENA')
    .executeTakeFirstOrThrow();
  const route = await createEnRouteFixture(database, {
    originLocationId: origin.id,
    driverId: driver.id,
    createdBy: admin.id,
  });
  await database
    .insertInto('inventory_balance')
    .values({
      stock_location_id: route.stockLocation.id,
      product_id: product.id,
      quantity: input.stockQuantity ?? '5.000',
    })
    .execute();
  return { admin, driver, unit, category, product, customer, origin, ...route };
}

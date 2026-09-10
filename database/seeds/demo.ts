import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { sql } from 'kysely';
import { loadEnvironment } from '../../apps/api/src/config/env.js';
import { createDatabase } from '../../apps/api/src/db/database.js';

if (process.env.DEMO_MODE !== 'true') throw new Error('DEMO_MODE=true is required.');
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 16)
  throw new Error('DEMO_PASSWORD needs at least 16 characters.');
const database = createDatabase(loadEnvironment(process.env).DATABASE_URL);

try {
  await database.transaction().execute(async (transaction) => {
    await sql`select pg_advisory_xact_lock(741923001)`.execute(transaction);
    await sql`create table if not exists demo_initialization (
      version integer primary key, initialized_at timestamptz not null default now()
    )`.execute(transaction);
    const initialized =
      await sql`select version from demo_initialization where version = 1`.execute(transaction);
    if (initialized.rows.length) return;
    const existing = await sql`select id from app_user limit 1`.execute(transaction);
    if (existing.rows.length)
      throw new Error('Demo initialization requires an empty, dedicated database.');

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const admin = randomUUID();
    await sql`insert into app_user (id, username, display_name, password_hash, role)
      values (${admin}::uuid, 'demo-admin', 'Administrador Demo', ${hash}, 'ADMINISTRATOR'),
        (${randomUUID()}::uuid, 'demo-driver', 'Chofer Demo', ${hash}, 'DRIVER')`.execute(
      transaction,
    );
    await sql`insert into business_setting
      (id, currency_code, currency_scale, business_timezone, partner_share_rate, money_rounding_mode, updated_by)
      values ('00000000-0000-4000-8000-000000000001', 'MXN', 2, 'America/Hermosillo',
        0.5, 'HALF_AWAY_FROM_ZERO', ${admin}::uuid)`.execute(transaction);

    const branch = randomUUID();
    const stock = randomUUID();
    const unit = randomUUID();
    await sql`insert into location (id, code, name) values
      (${branch}::uuid, 'DEMO-CENTRO', 'Almacen Centro Demo'),
      (${randomUUID()}::uuid, 'DEMO-NORTE', 'Almacen Norte Demo')`.execute(transaction);
    await sql`insert into stock_location (id, kind, branch_id)
      select case when id = ${branch}::uuid then ${stock}::uuid else gen_random_uuid() end,
        'BRANCH', id from location`.execute(transaction);
    await sql`insert into unit (id, code, name, quantity_scale)
      values (${unit}::uuid, 'PZA', 'Pieza', 0)`.execute(transaction);
    await sql`insert into vehicle (code, name) values ('DEMO-01', 'Camioneta de demostracion')`.execute(
      transaction,
    );

    const products = [
      {
        sku: 'DEMO-REF',
        name: 'Refresco Demo 600 ml',
        group: 'SODAS',
        price: '20.0000',
        quantity: '120.000',
      },
      {
        sku: 'DEMO-CAR',
        name: 'Carbon Demo 3 kg',
        group: 'CHARCOAL',
        price: '65.0000',
        quantity: '40.000',
      },
      {
        sku: 'DEMO-TOS',
        name: 'Tostadas Demo',
        group: 'TOSTADAS',
        price: '30.0000',
        quantity: '80.000',
      },
    ];
    for (const item of products) {
      const category = randomUUID();
      const product = randomUUID();
      const operation = randomUUID();
      await sql`insert into category (id, name, reporting_group)
        values (${category}::uuid, ${item.name}, ${item.group})`.execute(transaction);
      await sql`insert into product
        (id, sku, name, category_id, unit_id, standard_unit_price, low_stock_threshold)
        values (${product}::uuid, ${item.sku}, ${item.name}, ${category}::uuid,
          ${unit}::uuid, ${item.price}::numeric, 10)`.execute(transaction);
      await sql`insert into inventory_operation
        (id, operation_type, actor_id, reason, related_entity_type, related_entity_id)
        values (${operation}::uuid, 'ENTRY', ${admin}::uuid, 'Existencias ficticias de demostracion',
          'INVENTORY_OPERATION', ${operation}::uuid)`.execute(transaction);
      await sql`insert into inventory_balance (stock_location_id, product_id, quantity)
        values (${stock}::uuid, ${product}::uuid, ${item.quantity}::numeric)`.execute(transaction);
      await sql`insert into inventory_movement
        (operation_id, product_id, destination_stock_location_id, quantity, destination_balance_after,
          actor_id, reason, related_entity_type, related_entity_id)
        values (${operation}::uuid, ${product}::uuid, ${stock}::uuid, ${item.quantity}::numeric,
          ${item.quantity}::numeric, ${admin}::uuid, 'Existencias ficticias de demostracion',
          'INVENTORY_OPERATION', ${operation}::uuid)`.execute(transaction);
    }
    await sql`insert into customer (customer_number, display_name, city, notes) values
      ('DEMO-001', 'Abarrotes Ejemplo', 'Ciudad Demo', 'Cliente ficticio'),
      ('DEMO-002', 'Tienda de Demostracion', 'Ciudad Demo', 'Cliente ficticio')`.execute(
      transaction,
    );
    await sql`insert into demo_initialization (version) values (1)`.execute(transaction);
  });
  process.stdout.write('Demo database ready. Existing demo data was preserved.\n');
} finally {
  await database.destroy();
}

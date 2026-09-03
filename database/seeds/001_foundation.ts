import argon2 from 'argon2';
import { sql, type Kysely } from 'kysely';

const ADMIN_ID = '00000000-0000-4000-8000-000000000010';
const DRIVER_ID = '00000000-0000-4000-8000-000000000011';
const FIREFOX_DRIVER_ID = '00000000-0000-4000-8000-000000000012';
const WEBKIT_DRIVER_ID = '00000000-0000-4000-8000-000000000013';
const SETTINGS_ID = '00000000-0000-4000-8000-000000000001';

export async function seedFoundation(database: Kysely<unknown>): Promise<void> {
  const passwordHash = await argon2.hash('development-password-change-me', {
    type: argon2.argon2id,
  });

  await sql`
    insert into app_user (id, username, display_name, password_hash, role, active)
    values
      (${ADMIN_ID}::uuid, 'admin', 'Administrador', ${passwordHash}, 'ADMINISTRATOR', true),
      (${DRIVER_ID}::uuid, 'driver', 'Chofer de prueba', ${passwordHash}, 'DRIVER', true),
      (${FIREFOX_DRIVER_ID}::uuid, 'driver-firefox', 'Chofer Firefox', ${passwordHash}, 'DRIVER', true),
      (${WEBKIT_DRIVER_ID}::uuid, 'driver-webkit', 'Chofer WebKit', ${passwordHash}, 'DRIVER', true)
    on conflict (id) do update set
      display_name = excluded.display_name,
      password_hash = excluded.password_hash,
      role = excluded.role,
      active = true,
      archived_at = null,
      updated_at = now(),
      version = app_user.version + 1
  `.execute(database);

  await sql`
    insert into business_setting (
      id, currency_code, currency_scale, business_timezone, partner_share_rate,
      money_rounding_mode, updated_by
    ) values (
      ${SETTINGS_ID}::uuid, 'MXN', 2, 'America/Hermosillo', 0.500000,
      'HALF_AWAY_FROM_ZERO', ${ADMIN_ID}::uuid
    ) on conflict (id) do nothing
  `.execute(database);

  const hasLocation = await sql<{
    exists: boolean;
  }>`select to_regclass('public.location') is not null as exists`.execute(database);
  if (hasLocation.rows[0]?.exists) {
    await sql`
      insert into location (id, code, name, active)
      values
        ('00000000-0000-4000-8000-000000000020', 'MAGDALENA', 'Magdalena', true),
        ('00000000-0000-4000-8000-000000000021', 'CABORCA', 'Caborca', true)
      on conflict (id) do nothing
    `.execute(database);
    const hasStockLocation = await sql<{
      exists: boolean;
    }>`select to_regclass('public.stock_location') is not null as exists`.execute(database);
    if (hasStockLocation.rows[0]?.exists) {
      await sql`
        insert into stock_location (kind, branch_id)
        select 'BRANCH', id from location
        on conflict (branch_id) do nothing
      `.execute(database);
    }
  }
}

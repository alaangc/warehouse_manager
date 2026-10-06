import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { expect, it } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase } from '../../../src/db/database.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { startPostgres } from '../../support/postgres-container.js';

it('backfills USD and notes without changing amounts or losing old references', async () => {
  const postgres = await startPostgres();
  const db = createDatabase(postgres.connectionString);
  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: fileURLToPath(
          new URL('../../../../../database/migrations/', import.meta.url),
        ),
        import: (file) => import(pathToFileURL(file).href),
      }),
    });
    expect((await migrator.migrateTo('010_route_returns')).error).toBeUndefined();
    await seedFoundation(db);
    // Temporary counter allows the current writer to seed the old database schema.
    await sql`create table sale_note_counter (id integer primary key, value bigint); insert into sale_note_counter values (1,0)`.execute(
      db,
    );
    const f = await createSaleScenario(db);
    const input = saleCommand({
      customerId: f.customer.id,
      routeId: f.route.id,
      productId: f.product.id,
    });
    const ctx = {
      actorId: f.driver.id,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    };
    const sale = await new SaleService(db).confirm(input, ctx);
    await sql`
      drop table sale_note_counter;
      update business_setting set currency_code = 'MXN';
      update sale set sale_number = 'S-LEGACY', currency_code = 'MXN';
      alter table sale_ticket disable trigger sale_ticket_immutable;
      update sale_ticket set ticket_number = 'T-LEGACY', printable_snapshot = printable_snapshot ||
        '{"saleNumber":"S-LEGACY","ticketNumber":"T-LEGACY","currencyCode":"MXN"}'::jsonb;
      alter table sale_ticket enable trigger sale_ticket_immutable;
    `.execute(db);
    expect((await migrator.migrateToLatest()).error).toBeUndefined();
    const migrated = (
      await sql<{
        sale_number: string;
        legacy_sale_number: string;
        total: string;
        currency_code: string;
      }>`select * from sale where id = ${sale.id}`.execute(db)
    ).rows[0];
    expect(migrated).toMatchObject({
      sale_number: 'Nota: 001',
      legacy_sale_number: 'S-LEGACY',
      total: '4.25',
      currency_code: 'USD',
    });
    const ticket = await db
      .selectFrom('sale_ticket')
      .selectAll()
      .where('sale_id', '=', sale.id)
      .executeTakeFirstOrThrow();
    expect(ticket.printable_snapshot).toMatchObject({
      saleNumber: 'Nota: 001',
      ticketNumber: 'Nota: 001',
      currencyCode: 'USD',
      total: '4.25',
    });
    expect(await new SaleService(db).confirm(input, ctx)).toMatchObject({
      saleNumber: 'Nota: 001',
      currencyCode: 'USD',
      total: '4.25',
    });
    const next = await new SaleService(db).confirm(
      { ...input, clientOperationId: crypto.randomUUID() },
      { ...ctx, idempotencyKey: crypto.randomUUID() },
    );
    expect(next.saleNumber).toBe('Nota: 002');
  } finally {
    await db.destroy();
    await postgres.container.stop();
  }
}, 120_000);

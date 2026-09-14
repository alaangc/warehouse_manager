import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'kysely';
import { seedDrill, seedPrinterHistory } from './drill-fixture.js';
import {
  fingerprints,
  invariants,
  migrate,
  reviewedMigrations,
  startDrill,
} from './drill-support.js';
import { SaleService } from '../../apps/api/src/modules/sales/sale-service.js';

export async function verifyMigrations() {
  const migrations = await reviewedMigrations();
  const names = Object.keys(migrations);
  const started = Date.now();
  const empty = await startDrill();
  try {
    await migrate(empty.database, migrations);
    assert.equal(
      (await migrate(empty.database, migrations)).length,
      0,
      'Second application is a no-op',
    );
    await invariants(empty.database);
    process.stdout.write(`PASS empty database: ${names.length} migrations, repeat is a no-op\n`);
  } finally {
    await empty.close();
  }
  const upgrade = await startDrill();
  try {
    const prefix = Object.fromEntries(
      Object.entries(migrations).filter(([name]) => name <= '006_reporting_indexes'),
    );
    await migrate(upgrade.database, prefix);
    const fixture = await seedDrill(upgrade.database);
    const beforePrinters = await fingerprints(upgrade.database);
    await migrate(
      upgrade.database,
      Object.fromEntries(
        Object.entries(migrations).filter(([name]) => name <= '007_printer_settings'),
      ),
    );
    const afterPrinters = await fingerprints(upgrade.database);
    for (const [table, fingerprint] of Object.entries(beforePrinters))
      assert.deepEqual(
        afterPrinters[table],
        fingerprint,
        `${table} changed during printer migration`,
      );
    await seedPrinterHistory(upgrade.database);
    const before = await fingerprints(upgrade.database);
    await migrate(upgrade.database, migrations);
    const after = await fingerprints(upgrade.database);
    for (const [table, fingerprint] of Object.entries(before))
      assert.deepEqual(after[table], fingerprint, `${table} changed during upgrade`);
    await invariants(upgrade.database);
    const rows = (
      await sql<{ name: string }>`select name from kysely_migration order by name`.execute(
        upgrade.database,
      )
    ).rows.map((row) => row.name);
    assert.deepEqual(rows, names, 'No unapplied or unknown migrations');
    assert.deepEqual(
      await new SaleService(upgrade.database).confirm(fixture.command, fixture.saleContext),
      fixture.sale,
      'Existing command remains compatible after upgrade',
    );
    assert.equal((await migrate(upgrade.database, migrations)).length, 0);
    const beforeFailure = await fingerprints(upgrade.database);
    const failed = {
      ...migrations,
      '999_drill_expand': {
        up: async (database: typeof upgrade.database) => {
          await sql`alter table customer add column drill_note text`.execute(database);
          throw new Error('Injected migration failure');
        },
      },
    };
    await assert.rejects(migrate(upgrade.database, failed), /Injected migration failure/);
    assert.equal(
      (
        await sql<{
          count: number;
        }>`select count(*)::int as count from kysely_migration where name='999_drill_expand'`.execute(
          upgrade.database,
        )
      ).rows[0]!.count,
      0,
      'Failed migration must not be marked applied',
    );
    assert.deepEqual(
      await fingerprints(upgrade.database),
      beforeFailure,
      'Failed DDL must roll back',
    );
    assert.equal(
      (
        await sql<{
          present: boolean;
        }>`select exists (select 1 from information_schema.columns where table_name='customer' and column_name='drill_note') as present`.execute(
          upgrade.database,
        )
      ).rows[0]!.present,
      false,
    );
    // The failed migration was never applied. Repair it, then roll forward without down().
    await migrate(upgrade.database, {
      ...migrations,
      '999_drill_expand': {
        up: async (database) => {
          await sql`alter table customer add column drill_note text`.execute(database);
          await sql`update customer set drill_note='backfilled'`.execute(database);
        },
      },
    });
    const compatible = await upgrade.database
      .selectFrom('customer')
      .select(['id', 'display_name', 'city'])
      .where('id', '=', fixture.customerId)
      .executeTakeFirstOrThrow();
    assert.equal(compatible.display_name, 'Synthetic recovery customer');
    assert.deepEqual(
      (await sql<{ drill_note: string }>`select drill_note from customer`.execute(upgrade.database))
        .rows,
      [{ drill_note: 'backfilled' }],
      'Roll-forward must execute and verify its backfill',
    );
    assert.deepEqual(
      await new SaleService(upgrade.database).confirm(fixture.command, fixture.saleContext),
      fixture.sale,
    );
    await invariants(upgrade.database);
    process.stdout.write(
      `PASS populated upgrade, history fingerprints, old-command replay, failed-DDL rollback, additive roll-forward compatibility (${Date.now() - started} ms)\n`,
    );
  } finally {
    await upgrade.close();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyMigrations();
}

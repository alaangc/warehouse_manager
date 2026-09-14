import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'kysely';
import { createDatabase } from '../../apps/api/src/db/database.js';
import {
  fingerprints,
  invariants,
  migrate,
  reviewedMigrations,
  startDrill,
  until,
} from './drill-support.js';
import { seedDrill, seedPrinterHistory } from './drill-fixture.js';
import { SaleService } from '../../apps/api/src/modules/sales/sale-service.js';

export async function testRecovery() {
  const migrations = await reviewedMigrations();
  const drill = await startDrill();
  const started = Date.now();
  try {
    await migrate(drill.database, migrations);
    const fixture = await seedDrill(drill.database);
    await seedPrinterHistory(drill.database);
    const expected = await fingerprints(drill.database);
    await drill.run([
      'pg_dump',
      '-U',
      'drill',
      '-d',
      'warehouse_drill',
      '-Fc',
      '-f',
      '/tmp/wm.dump',
    ]);
    await drill.run(['createdb', '-U', 'drill', 'warehouse_restore']);
    await drill.run([
      'pg_restore',
      '-U',
      'drill',
      '-d',
      'warehouse_restore',
      '--exit-on-error',
      '/tmp/wm.dump',
    ]);
    const restoreUrl = new URL(drill.url);
    restoreUrl.pathname = '/warehouse_restore';
    const restored = createDatabase(restoreUrl.toString());
    try {
      assert.deepEqual(await fingerprints(restored), expected);
      await invariants(restored);
      assert.deepEqual(
        await new SaleService(restored).confirm(fixture.command, fixture.saleContext),
        fixture.sale,
      );
      assert.equal((await migrate(restored, migrations)).length, 0);
    } finally {
      await restored.destroy();
    }
    process.stdout.write(
      'PASS logical dump/restore: all table fingerprints, invariants and original sale replay\n',
    );
    // Keep WAL and the base backup inside this invocation's disposable container only.
    await drill.run(
      [
        'pg_basebackup',
        '-h',
        '127.0.0.1',
        '-U',
        'drill',
        '-D',
        '/tmp/wm_base',
        '-X',
        'stream',
        '-c',
        'fast',
      ],
      true,
    );
    await sql`create table recovery_probe (label text primary key)`.execute(drill.database);
    await sql`insert into recovery_probe values ('before-target')`.execute(drill.database);
    const recoveryPoint = (
      await sql<{
        lsn: string;
      }>`select pg_create_restore_point('warehouse_drill_target')::text as lsn`.execute(
        drill.database,
      )
    ).rows[0]!.lsn;
    await sql`insert into recovery_probe values ('after-target')`.execute(drill.database);
    const segment = (
      await sql<{
        segment: string;
      }>`select pg_walfile_name(pg_current_wal_lsn()) as segment`.execute(drill.database)
    ).rows[0]!.segment;
    await sql`select pg_switch_wal()`.execute(drill.database);
    await until(
      async () =>
        (
          await sql<{
            ready: boolean;
          }>`select last_archived_wal >= ${segment} as ready from pg_stat_archiver`.execute(
            drill.database,
          )
        ).rows[0]!.ready === true,
      'WAL archived through recovery target',
    );
    await drill.run(['touch', '/tmp/wm_base/recovery.signal'], true);
    await drill.run(
      [
        'pg_ctl',
        '-D',
        '/tmp/wm_base',
        '-l',
        '/tmp/wm_recovery.log',
        '-w',
        '-t',
        '30',
        '-o',
        "-p 5433 -c archive_mode=off -c restore_command='cp /tmp/wm_wal/%f %p' -c recovery_target_name=warehouse_drill_target -c recovery_target_action=promote",
        'start',
      ],
      true,
    );
    const recovered = createDatabase(drill.recoveryUrl);
    try {
      await until(
        async () =>
          (await sql<{ done: boolean }>`select not pg_is_in_recovery() as done`.execute(recovered))
            .rows[0]!.done,
        'recovery target promoted',
      );
      assert.deepEqual(
        (
          await sql<{ label: string }>`select label from recovery_probe order by label`.execute(
            recovered,
          )
        ).rows,
        [{ label: 'before-target' }],
        'Named recovery point must exclude later writes',
      );
      const actual = await fingerprints(recovered);
      delete actual.recovery_probe;
      assert.deepEqual(actual, expected, 'PITR restores every business row exactly');
      await invariants(recovered);
      assert.deepEqual(
        await new SaleService(recovered).confirm(fixture.command, fixture.saleContext),
        fixture.sale,
      );
      assert.equal((await migrate(recovered, migrations)).length, 0);
      process.stdout.write(
        `PASS WAL PITR: target ${recoveryPoint}, before-target present, after-target absent, fingerprints and replay intact (${Date.now() - started} ms)\n`,
      );
    } finally {
      await recovered.destroy();
    }
  } finally {
    await drill.close();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await testRecovery();
}

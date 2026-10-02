import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import { createDatabase, type AppDatabase } from '../../apps/api/src/db/database.js';

const exec = promisify(execFile);
export const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
export async function docker(args: string[], timeout = 120_000) {
  // Never log commands: the temporary container password may occur in argv.
  try {
    return (await exec('docker', args, { timeout, maxBuffer: 2_000_000 })).stdout.trim();
  } catch {
    throw new Error(
      `Disposable Docker operation failed (${args[0]}); check Docker availability and the last reported drill stage.`,
    );
  }
}
export async function until(check: () => Promise<boolean>, label: string, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(200);
  }
  throw new Error(`Timed out: ${label}`);
}
/** No DATABASE_URL, TEST_POSTGRES_ADMIN_URL, host mounts, or pre-existing containers. */
export async function startDrill() {
  const password = randomUUID();
  const id = await docker([
    'run',
    '--detach',
    '--rm',
    '--label',
    'warehouse.disposable-drill=true',
    '-e',
    'POSTGRES_USER=drill',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=warehouse_drill',
    '-p',
    '127.0.0.1::5432',
    '-p',
    '127.0.0.1::5433',
    'postgres:18-alpine',
    '-c',
    'archive_mode=on',
    '-c',
    'archive_command=test ! -f /tmp/wm_wal/%f && cp %p /tmp/wm_wal/%f',
  ]);
  assert.match(id, /^[a-f0-9]{64}$/);
  const run = (args: string[], asPostgres = false) =>
    docker([
      'exec',
      ...(asPostgres ? ['--user', 'postgres'] : []),
      '-e',
      `PGPASSWORD=${password}`,
      id,
      ...args,
    ]);
  try {
    await until(async () => {
      try {
        await run(['pg_isready', '-h', '127.0.0.1', '-U', 'drill', '-d', 'warehouse_drill']);
        return true;
      } catch {
        return false;
      }
    }, 'PostgreSQL ready');
    await run(['mkdir', '-m', '700', '/tmp/wm_wal'], true);
    const port = (await docker(['port', id, '5432/tcp'])).split(':').at(-1)!;
    const recoveryPort = (await docker(['port', id, '5433/tcp'])).split(':').at(-1)!;
    assert.match(port, /^\d+$/);
    assert.match(recoveryPort, /^\d+$/);
    const url = `postgresql://drill:${password}@127.0.0.1:${port}/warehouse_drill`;
    const database = createDatabase(url);
    const version = (
      await sql<{ version: string }>`select current_setting('server_version') as version`.execute(
        database,
      )
    ).rows[0];
    assert.ok(version, 'Missing PostgreSQL version');
    assert.ok(version.version.startsWith('18.'), 'Drills require PostgreSQL 18');
    process.stdout.write(`Drill container ${id.slice(0, 12)}: PostgreSQL ${version.version}\n`);
    return {
      id,
      run,
      database,
      url,
      recoveryUrl: `postgresql://drill:${password}@127.0.0.1:${recoveryPort}/warehouse_drill`,
      async close() {
        try {
          await database.destroy();
        } finally {
          await docker(['stop', '--time', '5', id]);
        }
      },
    };
  } catch (error) {
    await docker(['stop', '--time', '5', id]);
    throw error;
  }
}
export function verifyManifest(actual: Record<string, string>, manifest: unknown) {
  assert.ok(
    manifest && typeof manifest === 'object' && !Array.isArray(manifest),
    'Invalid migration manifest',
  );
  const reviewed = manifest as Record<string, unknown>;
  const files = Object.keys(actual).sort();
  assert.deepEqual(
    files,
    Object.keys(reviewed).sort(),
    'Migration manifest must cover every migration',
  );
  for (const file of files) {
    assert.match(file, /^\d{3}_[a-z0-9_]+\.ts$/, 'Invalid migration filename');
    assert.equal(typeof reviewed[file], 'string', 'Invalid migration checksum');
    assert.match(reviewed[file] as string, /^[a-f0-9]{64}$/, 'Invalid migration checksum');
    assert.equal(actual[file], reviewed[file], `Applied migration changed: ${file}`);
  }
}
export async function reviewedMigrations() {
  const manifest = JSON.parse(
    await readFile(new URL('../migrations/checksums.json', import.meta.url), 'utf8'),
  ) as unknown;
  const files = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.ts')).sort();
  const actual: Record<string, string> = {};
  for (const file of files)
    actual[file] = createHash('sha256')
      // Hash the Git text representation consistently across Windows checkouts.
      .update((await readFile(`${migrationDirectory}/${file}`, 'utf8')).replaceAll('\r\n', '\n'))
      .digest('hex');
  verifyManifest(actual, manifest);
  const migrations: Record<string, Migration> = {};
  for (const file of files) {
    migrations[file.slice(0, -3)] = (await import(
      pathToFileURL(`${migrationDirectory}/${file}`).href
    )) as Migration;
  }
  return migrations;
}
export async function migrate(database: AppDatabase, migrations: Record<string, Migration>) {
  const result = await new Migrator({
    db: database,
    provider: { getMigrations: async () => migrations },
  }).migrateToLatest();
  if (result.error) throw result.error;
  return result.results ?? [];
}
export async function fingerprints(database: AppDatabase) {
  const tables = (
    await sql<{
      tablename: string;
    }>`select tablename from pg_tables where schemaname = 'public' and tablename not like 'kysely_%' order by tablename`.execute(
      database,
    )
  ).rows;
  const result: Record<string, { count: string; digest: string }> = {};
  for (const { tablename } of tables) {
    result[tablename] = (
      await sql<{ count: string; digest: string }>`select count(*)::text as count,
      md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text), '')) as digest
      from ${sql.table(tablename)} t`.execute(database)
    ).rows[0]!;
  }
  return result;
}
export async function invariants(database: AppDatabase) {
  const counts = (
    await sql<{ negative: number; ledger: number; tickets: number; closed: number }>`
    with deltas as (
      select product_id, destination_stock_location_id as location, quantity from inventory_movement where destination_stock_location_id is not null
      union all select product_id, source_stock_location_id, -quantity from inventory_movement where source_stock_location_id is not null
    ), totals as (select product_id, location, sum(quantity) as quantity from deltas group by product_id, location)
    select
      (select count(*)::int from inventory_balance where quantity < 0) as negative,
      (select count(*)::int from inventory_balance b full join totals t on b.product_id=t.product_id and b.stock_location_id=t.location where coalesce(b.quantity,0) <> coalesce(t.quantity,0)) as ledger,
      (select count(*)::int from sale s left join sale_ticket t on t.sale_id=s.id where t.id is null) as tickets,
      (select count(*)::int from inventory_balance b join stock_location l on l.id=b.stock_location_id join route r on r.id=l.route_id where r.state='CLOSED' and b.quantity <> 0) as closed
  `.execute(database)
  ).rows[0];
  assert.deepEqual(counts, { negative: 0, ledger: 0, tickets: 0, closed: 0 });
  for (const table of ['audit_event', 'inventory_movement', 'output_attempt']) {
    const privileges = (
      await sql<{
        update: boolean;
        delete: boolean;
      }>`select has_table_privilege('warehouse_runtime', ${table}, 'UPDATE') as update, has_table_privilege('warehouse_runtime', ${table}, 'DELETE') as delete`.execute(
        database,
      )
    ).rows[0];
    assert.deepEqual(privileges, { update: false, delete: false });
  }
}

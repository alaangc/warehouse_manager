# Database migration and recovery runbook

## Local verification (safe to run alongside development)

Use the pinned Node/pnpm versions, install workspace dependencies, and start Docker
Desktop. From the repository root run:

```sh
pnpm --filter @warehouse/contracts build
pnpm db:verify
pnpm db:recovery:test
```

Both commands create their own PostgreSQL 18 containers and synthetic records. They
ignore `DATABASE_URL` and `TEST_POSTGRES_ADMIN_URL`, do not load an application `.env`,
do not mount host directories, and do not reset Compose services or existing volumes.
Only randomly published loopback ports are exposed. Container IDs and server versions
are printed; credentials and row contents are not printed. Normal success and failure
paths close connections and remove the containers and their anonymous volumes.

Do **not** run `db:test:reset` or `docker compose down -v` as preparation. These drills
need no development-database reset. `pnpm db:migrate` is different: it targets the
database configured for the API and must be used deliberately.

If the process is forcibly terminated, inspect `docker ps -a` for the exact ID printed
by that invocation and its `warehouse.disposable-drill=true` label. Stop only that
verified disposable container. Do not run broad container or volume prune commands.

## What the commands prove

`db:verify`:

1. Validates all migration filenames and SHA-256 hashes against
   `database/migrations/checksums.json` before starting Docker. Missing, added without
   review, modified, or malformed migrations fail the check.
2. Applies every migration to an empty database and verifies a second application is
   a no-op, with no pending or unknown migration entries in the populated path.
3. Builds synthetic business history at migration 006 through the real services:
   catalog/customer records, inventory entries, confirmed route load, an exact sale
   and replay, return/reconciliation with a documented shortage, zero-stock route
   closure, cash close and immutable correction, audits and idempotency records.
4. Applies 007, compares all pre-existing table fingerprints, adds synthetic printer
   configuration/preference/TEST_PRINT history, applies 008 and again compares every
   pre-existing table. Numeric data is fingerprinted in PostgreSQL text form, not
   converted to JavaScript floating-point values.
5. Verifies nonnegative balances, ledger/balance agreement, one ticket per sale,
   zero stock in closed routes, and restrictive runtime ledger permissions. Replaying
   the original sale after the upgrade must return its original response.
6. Injects an unapplied, test-only DDL migration failure and verifies its column,
   migration entry and row changes roll back. Repairs that **unapplied** migration,
   expands/backfills an additive nullable column and proves existing customer reads
   and sale replay still work. This synthetic migration is never written to the
   migration directory or applied outside the disposable database.

`db:recovery:test`:

1. Migrates and populates a disposable database, including historical records and
   synthetic printer attempts.
2. Takes a custom-format `pg_dump` and restores it with `pg_restore --exit-on-error`
   into a separate database. Compares every public application table, invariants,
   migration compatibility and the original idempotent sale response.
3. Takes a physical `pg_basebackup` with streamed WAL. Creates a probe row after the
   backup, records a named recovery point, then commits a second probe row.
4. Switches WAL and waits for archiving through the target segment. Starts a separate
   PostgreSQL instance from the base backup with `recovery.signal`, the archived WAL,
   the named recovery target and promotion at that target.
5. Requires the first probe row to exist and the later row to be absent, proving WAL
   replay actually stopped at the target. Rechecks all business fingerprints,
   invariants, migration compatibility and original-command replay.

A logical dump is not a WAL/PITR backup; both paths are exercised separately. See the
[PostgreSQL 18 recovery documentation](https://www.postgresql.org/docs/18/continuous-archiving.html)
and [pg_basebackup reference](https://www.postgresql.org/docs/18/app-pgbasebackup.html).

The fixture is small and synthetic, not a production-volume benchmark. Same-cluster
logical restore reuses the existing roles; a replacement production cluster also
needs independently backed-up roles, grants, server configuration and extensions.
The PITR drill uses the same disposable container's storage, which tests the procedure
but is **not** a resilient off-host backup architecture.

## Reviewed migration inventory

Existing migration files are immutable. Add new numbered migrations and their new
manifest entries; never refresh an existing hash just to make a changed file pass.
The manifest is a reviewed source baseline, not a cryptographic attestation of an
already-deployed database. Production deployment must compare the approved artifact
and recorded deployment hashes; the ordinary application migrator does not currently
persist per-file checksums in PostgreSQL.

| Migration             | Preconditions / lock and runtime considerations                                                                        | Recovery and compatibility                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 001 foundation        | Empty application schema; controlled owner can create roles and pgcrypto                                               | Creates auth/settings/audit foundation; destructive down is not an operational rollback               |
| 002 catalog/inventory | 001; new catalog/ledger tables and indexes                                                                             | Preserve any existing foundation rows; never drop populated ledgers                                   |
| 003 sales             | 002; migration owner can install btree_gist; exact numeric and exclusion constraints                                   | New customer/sale snapshots; preserve history and price constraints                                   |
| 004 routes            | 003; new load/reconciliation tables, checks and immutable-load trigger                                                 | New route history; no down after business use                                                         |
| 005 reporting         | 004; new snapshot/current-period tables, indexes and constraint triggers                                               | Preserve immutable closes and successor links; no destructive rollback                                |
| 006 reporting index   | 005; ordinary CREATE INDEX on sale may block writes while building                                                     | Measure with production-sized data; future index changes need a separate reviewed migration           |
| 007 printers          | 006; new profile/preference/attempt tables and grants                                                                  | Tested against populated business history; old business reads/replays remain valid                    |
| 008 documents         | 007; ALTER TABLE output_attempt takes strong locks and validates existing history; new polymorphic source FKs/triggers | Existing TEST_PRINT rows are preserved; guarded down refuses document history; roll forward after use |

DDL generally runs inside the Kysely migration transaction. Table size, concurrent
traffic and lock waits determine deployment duration; the small drill runtime is not
a production estimate. Record measured lock waits/durations on a sanitized, comparable
staging dataset before scheduling a production change. New data-changing migrations
must extend the fixture and invariant checks for their own affected rows.

## Production change procedure

1. Record the release commit, migration/hash list, owner, affected tables, intended
   changes, staging measurements, maintenance window and abort thresholds.
2. Verify the target database identity, PostgreSQL major version, migration ledger,
   required extensions and migration-owner permissions. Do not give the runtime role
   schema ownership or permission to modify immutable ledger rows.
3. Verify an off-host backup and continuous WAL archive, retention, encryption/access
   policy and monitoring. Record a recoverable point before the change. Prove restore
   access in a disposable environment before destructive or large migrations.
4. For shape changes, expand first; deploy code that can tolerate both shapes;
   backfill in bounded, observable batches; verify counts, exact values and invariants;
   only then schedule a separate contract/removal migration.
5. Apply only the reviewed artifact. On failure, inspect migration status and whether
   PostgreSQL rolled back the transaction. Do not repeatedly retry lock timeouts
   without understanding concurrent work. Repair an unapplied migration or append
   a new roll-forward migration; never edit a successfully applied migration.
6. Recheck ledger balances, ticket uniqueness, closed-route stock, cash-close pointer
   integrity, FK/price constraints, audit/append-only guarantees, and protected API
   smoke tests. Capture results and measured duration before reopening writes.
7. Before rolling back application code, test that exact old release against the new
   schema and rows written by the new release. The additive smoke drill is not proof
   that every historical application binary is compatible. If compatibility is not
   proven, roll forward instead.

Do not use migration `down()` to erase business history. Restoring/PITR into production
requires explicit incident approval: stop/fence writers, restore into a separate
isolated target, verify the recovery point and invariants, reconcile lost post-target
work, then perform a controlled cutover. Never overwrite the source first.

Database backups do not include generated PDF files stored outside PostgreSQL.
Coordinate document-storage backups with the recovery point, or run authorized
canonical regeneration from restored immutable snapshots and verify hashes/status.
Never repeat a sale/load/cash-close mutation to rebuild its document. Keep the original
database and backup artifacts recoverable until the incident owner approves disposal.

## Evidence and release gate

Record the tested commit, Node/pnpm/PostgreSQL/Docker versions, fixture description,
commands, PASS/FAIL output, durations, restore target and invariant results. Local
completion does not approve a production deployment, production RPO/RTO, the physical
printer gate T133 or the broader release review. See
[T134 evidence](../../specs/001-warehouse-management/evidence/t134-migrations-recovery.md).

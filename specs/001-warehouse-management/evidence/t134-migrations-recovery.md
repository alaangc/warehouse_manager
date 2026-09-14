# T134: Migration verification and recovery drills

Verified 2026-09-14 on main, based on `20ceae5`, with Node.js 24.20.0,
pnpm 10.28.1, Docker Engine 29.7.2 and PostgreSQL 18.6 (`postgres:18-alpine`).

## Scope

Added executable `db:verify` and `db:recovery:test` scripts, shared disposable-container
and fingerprint helpers, a synthetic business fixture, a reviewed SHA-256 migration
manifest, manifest regression tests, database-script type checking, and the
[operations runbook](../../../docs/operations/migrations.md). README and quickstart
now document safe drill commands without a development-database reset.

No applied SQL migration was changed. T133 physical hardware acceptance remains
pending; its preparation document is committed separately.

## Results

| Verification | Observed result |
|---|---|
| Fresh database | All 8 reviewed migrations applied; second application was a no-op |
| Populated upgrade | 006 business history survived 007; printer/preference/TEST_PRINT history and all existing rows survived 008 |
| Historical integrity | PostgreSQL-side table fingerprints matched before/after upgrades and both restore paths |
| Invariants | Nonnegative balances, ledger agreement, ticket presence, zero closed-route stock and immutable-ledger runtime privileges passed |
| Compatibility | Original customer reads and exact original sale replay passed after upgrade, additive backfill and recovery |
| Failed migration | Injected DDL failure rolled back its column and did not mark the migration applied; existing row fingerprints were unchanged |
| Roll-forward | Repaired unapplied synthetic migration executed, backfilled the test column and preserved old reads/replay |
| Logical recovery | Custom-format dump restored with exit-on-error into a separate database; fingerprints, invariants and migration no-op passed |
| WAL/PITR recovery | Recovered to named target at LSN `0/4028798`; before-target probe existed and after-target probe was absent; business fingerprints and replay passed |
| Cleanup | No containers with the disposable-drill label remained after the final check |
| Manifest tests | 10 passed, including modified/missing/unreviewed files, malformed hashes and invalid filenames |
| Unit/frontend suites | 33 test files, 310 tests passed |
| Static/build checks | Workspace lint/typecheck, new database-script typecheck, independent API/web builds, formatting and diff checks passed |

Final populated migration verification reported **8,818 ms** across its empty and
upgrade scenarios. The recovery run reported **2,391 ms** inside its prepared container.
These are local small-fixture timings, not production lock-duration or RPO/RTO claims.
The existing Kysely ordering deprecation and Vite bundle-size warnings remain.

The fixture uses real services to create catalog/customer records, 100 units of branch
stock, a confirmed 10-unit route load, an exact 2-unit sale and idempotent replay,
7 returned units with a documented 1-unit shortage, zero-stock route closure,
cash-close correction history, audit events and saved command responses. Printer
history is explicitly synthetic; no physical printing occurs in this drill.

## Reproduction

With the pinned Node/pnpm versions, installed dependencies and Docker running:

```sh
pnpm --filter @warehouse/contracts build
pnpm db:verify
pnpm db:recovery:test
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build:api
pnpm build:web
```

The commands ignore application database URLs and create only new, loopback-exposed
containers without host mounts. The last printed container ID identifies owned
resources if a process is forcibly interrupted. Normal success/failure paths remove
only those resources; no existing development or production database is reset.

## Constitution review and limits

Database operations stay in trusted tooling and API services; no browser database
access, business-rule changes, inexact financial arithmetic or history rewrite was
introduced. Existing migrations have an explicit reviewed hash baseline. Failed
schema changes, successful roll-forward, preserved audits/history, replay safety and
recovery have executable assertions. Scripts now participate in workspace type checks.

This satisfies the local T134 tooling/drill scope, not the production release gate.
Production still needs measured staging lock impact, verification of the exact old
application release, independently protected off-host backups/WAL and roles/config,
document-storage recovery, incident/cutover approval, and the final reviewer gate.
The runbook makes these boundaries explicit; same-container test backups are not
presented as resilient production storage.

# Render/Neon merge validation — 2026-10-01

Status: local merge validated in part; **not approved for deployment**. No push,
Render configuration change, Neon connection, live migration or live seed was performed.

Inputs: `origin/demo/render-neon` at `4277439` and `origin/main` at `dbc6b34`
(including merged PR #3). Origin was fetched before merging. Conflicts were limited
to `apps/api/src/server.ts` and root `package.json`.

## Merge decisions

- Keep main's complete API, document routes, HTTP security, observability and schema
  readiness check. Keep the demo's same-origin React static hosting and SPA fallback.
- Route the demo entry point through the shared `startServer`; bind to `0.0.0.0`.
  A stale schema must fail before opening the listener, including in demo mode.
- Require verified `TRUST_PROXY` IPs/CIDRs for production demo startup, before any
  migration. Do not weaken HTTPS, accept arbitrary forwarded headers, or guess
  Render's internal network ranges. This is a required operator configuration step.
- Preserve the original one-time demo initializer and its database marker. A repeat
  initialization must not overwrite passwords or business data. Never run the
  development seed on Neon.
- Retain manual deployments and the existing free-service configuration. No paid
  storage is enabled. Ephemeral PDF storage limitations are documented in the
  [deployment guide](demo-deployment.md).
- Existing migrations 001–007 are byte-identical between the two input branches.
  Main adds 008–010; no migration was edited by this merge.

## Local results

Environment: Node 24.20.0, pnpm 10.28.1, Docker 29.7.2; migration drill reported
PostgreSQL 18.6. Database suites used disposable local Docker databases, not Neon
or the development database. Build preceded the deployment tests.

| Check                                               | Result                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                        | PASS; existing frontend bundle-size warning remains                                                      |
| `pnpm typecheck`                                    | PASS                                                                                                     |
| `pnpm lint`                                         | PASS after correcting an unused variable in the new test                                                 |
| Prettier on deployment/merge-edited files           | PASS                                                                                                     |
| `pnpm security:browser`                             | PASS                                                                                                     |
| `git diff --check`                                  | PASS                                                                                                     |
| Focused demo deployment + database readiness suites | PASS, 8 tests                                                                                            |
| Full API integration project                        | PASS, 28 files / 250 tests                                                                               |
| `pnpm test:unit`                                    | FAIL, 361 passed / 4 failed                                                                              |
| API contract project                                | FAIL, 143 passed / 2 failed                                                                              |
| `pnpm db:verify`                                    | FAIL during populated historical fixture setup; empty-schema 10-migration and repeat-no-op checks passed |

The initial sandboxed unit run also had seven HTTP-listener permission failures;
the permitted rerun removed those environmental failures. The counts above are from
that rerun. No failing assertions were skipped or relaxed.

The demo regression starts with schema 007, initializes demo data, edits a product,
upgrades to the full schema, and repeats initialization with a different environment
password. It verifies unchanged user rows/password hashes, inventory balances and
movement rows; existing credentials for both roles; Administrator-only API denial;
HTML/SPA responses; no HTML fallback for missing API routes/assets; document-route
presence; security headers; trusted versus untrusted HTTPS forwarding; and shared
startup readiness. This is a synthetic fixture, not proof about the live Neon data.

## Outstanding validation failures inherited from main

The following files and their relevant application/contract/fixture dependencies
are unchanged from `origin/main` in this merge (`git diff origin/main -- ...` is
empty). They were not repaired as part of the deployment merge:

1. `apps/api/tests/unit/db/migration-manifest.test.ts` expects eight migrations;
   main now includes ten.
2. Two cases in `apps/web/tests/dashboard/dashboard-page.test.tsx` fail to find route
   cards. Their HTTP mocks match URLs ending in `/routes`, while the updated
   dashboard requests active routes with query parameters.
3. `apps/web/tests/sales/sale-form.test.tsx` cannot find the old exact `Quantity`
   field label after the sales UI redesign. Review the new UI and update the test
   while preserving its validation/confirmation assertions.
4. Reporting and user-settings API contract tests compare raw YAML substrings;
   their expected inline-array spacing differs from the current OpenAPI formatting.
   Prefer structural checks rather than weakening the contract assertions.
5. The populated `pnpm db:verify` drill seeds schema 006 using the current
   reconciliation service, which now inserts into `route_return` introduced in 010.
   Setup fails with `relation "route_return" does not exist`, before the populated
   upgrade verification runs. Repair the historical fixture without bypassing
   historical-data preservation checks or modifying already-applied migrations.

Local logs (not committed) are `/private/tmp/warehouse-demo-merge-unit.log`,
`/private/tmp/warehouse-demo-merge-contract.log` and
`/private/tmp/warehouse-demo-merge-integration.log`.

## Before any live deployment

- Resolve the failures above, then repeat applicable checks. Browser E2E, actual
  Render ingress behavior, physical printers and human acceptance were not run here.
- Verify Render ingress proxy addresses and configure `TRUST_PROXY`; no guessed
  value is supplied. An absent value intentionally stops production demo startup.
- Confirm the existing Neon database identity, applied migrations, recoverable
  backup and maintenance window. Migration 010 backfills route-return history and
  explicitly disallows destructive rollback. Test recovery/compatibility rather
  than assuming the previous binary can simply be restored.
- Obtain approval to push and deploy. Confirm the service still follows
  `demo/render-neon` with automatic deployment off; preserve existing secrets and
  perform the live role/data/document smoke tests in the deployment guide.

Constitution check: API authority, role enforcement, exact arithmetic, immutable
history and transaction boundaries from main remain intact. No migration/history
rewrite or development-secret deployment was introduced. The testing/review and
operational release gates remain open due to the failures and external checks above;
this record is not a release sign-off or a constitution exception.

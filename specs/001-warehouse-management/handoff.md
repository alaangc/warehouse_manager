# Handoff Document: warehouse_manager Project Continuation

## Just Completed (current session)

**T032 is DONE** — `apps/api/tests/integration/inventory/inventory-ledger.test.ts`
is now a real PostgreSQL 18/Testcontainers suite. It proves movement/balance
reproduction, low-stock threshold evaluation, compensating reversal links, mandatory
reason rollback, multi-line atomicity, archived-history retention, restrictive deletes,
same-transaction audits, and complete catalog/inventory rollback when audit insertion
is deliberately failed. The full integration suite passes 16/16 and T032 is checked
off in `tasks.md`.

The root `README.md` now contains a verified Docker-based local setup and test guide.
During the smoke test, two startup blockers were fixed: PostgreSQL 18's Compose volume
now mounts at `/var/lib/postgresql`, and API configuration loads `apps/api/.env` while
ignoring unrelated operating-system environment variables. Migrations, seeding, API
health on port 3000, and Vite on port 5173 were verified. The development PostgreSQL
container was left running for the user.

**Next session = T033** (line 96 of `tasks.md`): real concurrent last-unit,
deterministic-lock, negative-balance, rollback, and idempotent-retry tests in
`apps/api/tests/integration/inventory/inventory-concurrency.test.ts`.

## Previously Completed

**T031 is DONE** — the real US1 contract suite (`apps/api/tests/contract/inventory/inventory.contract.test.ts`, 740 lines: 2 schema tests + 12 HTTP tests) is fully green against real Postgres (testcontainers). All gates passed: contract 23/23, integration 14/14, `pnpm typecheck`, `pnpm lint`, prettier. T031 is checked off in `tasks.md` and committed (no push).

## What the previous session did (T031 details)

Applied the `mapProduct` fix from the prior handoff **plus two gaps the prior analysis had missed** (vitest stops a test at its first failing assertion, so later failures in the same test only surface after the early ones are fixed):

1. **`apps/api/src/modules/catalog/catalog-routes.ts`** (API-side, genuine contract violations):
   - Added `mapProduct(row: Selectable<ProductTable>)` (mirrors `toCustomerResource(row: Selectable<CustomerTable>)` in `customer-repository.ts` — the codebase's row→resource pattern) mapping raw product rows to the OpenAPI `Product` schema: camelCase, `additionalProperties: false`, `standardUnitPrice: Number(row.standard_unit_price).toFixed(4)`, `lowStockThreshold: Number(row.low_stock_threshold).toFixed(3)`. Applied to GET `/products` list (replaced the inline map), POST `/products` (`.then((row) => mapProduct(row))`), GET `/products/:id`, PATCH `/products/:id`. Audit snapshots keep the raw row inside the transaction.
   - Wired `productService.requireArchiveReason(input.active, input.reason)` into the product PATCH mutate callback. It was defined in `catalog-service.ts` but **never called** — archiving without a reason silently succeeded; `data-model.md` requires a reason for archival. Throws inside the transaction → rollback → 422 `ARCHIVE_REASON_REQUIRED` (mapped by existing `mapWriteError`).
2. **`apps/api/tests/contract/inventory/inventory.contract.test.ts`** (test-side):
   - Test 2: the product list GET was unauthenticated (expected 200, but global session security → 401). Now `authed(admin)`.
   - Transfer test: the two balance `Map` builders read a nonexistent top-level `row.branchId`; the balance resource nests it (`row.stockLocation.branchId` — matches OpenAPI `InventoryBalance`; the API was right, the test was wrong).
   - Round 1+2 edits from the session before that (memoized `login()` per username, `.get(url).set(...)` supertest ordering, random codes `.slice(0,12)`, cookies on reads/unknown-route) were verified green.
   - Ran prettier on both files. Note: in git the test file appears as a full 740-line addition because HEAD held the original 46-line stub — the whole suite is new in this commit.

## Running tests (Docker socket — important)

The user's docker CLI uses the `desktop-linux` context (`unix://$HOME/.docker/run/docker.sock`); `/var/run/docker.sock` does NOT exist on this machine. One run failed with `Could not find a working container runtime strategy` because Docker Desktop was restarting its daemon mid-run (socket mtimes 1 min apart). Reliable recipe:

- If `docker ps` errors: `open -a Docker`, wait ~20s.
- Run with the socket pinned: `DOCKER_HOST=unix://$HOME/.docker/run/docker.sock pnpm vitest run --config vitest.workspace.ts --project api-contract` (pinning makes testcontainers' ConfigurationStrategy deterministic; the rootless strategy also probes `~/.docker/run/docker.sock` when the daemon is stable).
- `--project api-contract --project api-integration` for the whole API suite. `postgres:18-alpine` is cached; runs take ~3–4s.
- Root scripts: `pnpm test:api` (contracts build + contract suite), `pnpm test:integration`, `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`.

## Gotchas & observations (carry over)

- **First-failing-assertion trap**: after fixing an early failure in a long test, re-run and read the NEXT error — this session surfaced two more that way.
- **supertest 7.2.2 runtime**: `request(app)` returns method functions only; there is NO `.set` on it — always chain `.method(url).set(...)`. `@types/supertest` types this as `TestAgent`, so tsc will NOT catch it; only running tests will.
- **Global OpenAPI session security**: everything except `/health` + `/auth/login` requires the session cookie, including GETs. The catalog router has a router-level `requireAuthenticated`, so even unknown `/api/v1` routes 401 when unauthenticated (contract-conformant — fix the test, not the app). Origin + CSRF protection apply to unsafe methods only (POST/PUT/PATCH/DELETE).
- **Login rate limit**: 10/min per username (429 beyond) — hence the memoized `login()` in the contract file (sessions are DB-backed and persist for the whole file).
- **One shared DB across the 12 contract HTTP tests** (sequential; `sequence.concurrent: false`). Later tests may rely on earlier rows (e.g. `vehicle ... limit(1)` lookups) — keep tests order-stable.
- **Remaining catalog response-shape gap (defer to T038/T040)**: units/categories/locations/vehicles create/patch/detail routes still return raw snake_case rows (`quantity_scale`, `reporting_group`, `archived_at`, `created_at`, `updated_at`) while OpenAPI `Unit`/`Category`/`Location`/`Vehicle` schemas are camelCase + `additionalProperties: false` (e.g. required `quantityScale`). Product is fixed (T031). Nothing catches these yet — fold per-entity `mapX(row: Selectable<XTable>)` mappers into the catalog repository/service consolidation in T038/T040.
- **Remaining archive-reason gap (defer to T038/T040)**: location/category/unit/vehicle PATCH routes do not enforce the archival reason (product route does now, T031). Add `requireArchiveReason` to the other routes in T038/T040 — for vehicles keep the `VEHICLE_ASSIGNED` check FIRST (a contract test expects 409 there).
- **numeric → string**: node-postgres returns `numeric` as strings — always `Number(...).toFixed(n)` when mapping (OpenAPI: 4dp `UnitPrice`, 3dp `Quantity`).
- **Code length caps**: unit/location/vehicle `code` max 32, product `sku` max 64 — keep random test codes ≤32.
- **Problems**: `application/problem+json` `{type:'https://warehouse-manager.local/problems/<code-kebab>', title, status, code, detail, instance, requestId, ...extensions}` (see `apps/api/src/http/problem-handler.ts`); ZodError → 422 `VALIDATION_FAILED` with per-field `errors`; PG 23505 → 409 `CATALOG_DUPLICATE`.
- **Inventory route behaviors** (verified by the green suite): GET balances/movements → `requireAuthenticated`; Driver movements without `routeId` → 403 `ROUTE_SCOPE_REQUIRED`; Driver balances auto-scoped via route join; operations/transfers/reversals → `requireRole('ADMINISTRATOR')`. Balances serialize `quantity` toFixed(3), `lowStockAlert`, nested `stockLocation {id, kind, label, branchId, routeId}`.
- `packages/contracts/scripts/generate-openapi.ts` is a copyFile of the planning `openapi.yaml` — the "generated" OpenAPI is hand-maintained (T136 gap).

## Current project state

Phase 1 + Phase 2 genuinely done (T019's "integration" is mock-only — DB behaviors unproven; fix when convenient). US1: API functionally complete; **T031 and T032 done**; T033 (integration stub), T034 (web 17-line stub), T035 (E2E 7-line self-skipping stub), T038/T040 (thin catalog repo/service — logic inlined in `catalog-routes.ts`, ~513 lines), T043 (catalog UI create-only), T046 (movement history basic) remain. US2/US3/US4 implementations exist but missing some integration/E2E tests. US5/US6/US7 + Polish: zero code.

## Seeded fixtures (foundation)

admin `00000000-0000-4000-8000-000000000010` (username `admin`, password `development-password-change-me`), driver `...011` (`driver`), locations MAGDALENA `...020` / CABORCA `...021` + branch stock_locations, business_setting MXN/2dp/America/Hermosillo.

## Key files

- `specs/001-warehouse-management/tasks.md` — checkboxes (T033 line 96, T034 97, T035 98, T038 104, T040 106, T043 109, T046 112)
- `specs/001-warehouse-management/{spec,plan,data-model}.md`, `contracts/openapi.yaml` (planning copy, authoritative)
- `packages/contracts/openapi.yaml` — 56 paths, global session security; `Product`/`InventoryBalance`/`Unit`/… camelCase + `additionalProperties: false`
- `apps/api/tests/contract/inventory/inventory.contract.test.ts` — 740 lines, 14 tests, all green; contains the real-DB `beforeAll` pattern and `authed()` supertest helper
- `apps/api/src/modules/catalog/catalog-routes.ts` — `mapProduct` added; product routes fully camelCase; units/categories/locations/vehicles still raw (T038/T040)
- `apps/api/src/modules/customers/customer-repository.ts` — `toCustomerResource` = the reference mapper pattern
- `apps/api/tests/integration/inventory/inventory-ledger.test.ts` — completed T032 real-PostgreSQL ledger lifecycle suite
- `apps/api/src/modules/inventory/{inventory-routes,inventory-service}.ts` — balance/movement behavior
- `vitest.workspace.ts` — projects: api-unit, api-contract, api-integration, web

## Plan status

- **Approved**: one-task-per-session workflow (definition of done: tests green → flip checkbox → update this handoff → commit, no push)
- **Approved (earlier)**: US1-first priority order
- **Decided this session** (in T031's spirit): product response shape + product archive-reason as API fixes (required for the contract test to be green; product-scoped only — the wider catalog gaps deliberately deferred to T038/T040)
- **Deferred sequence**: T033 → T034 → T035 → T038/T040 (per-entity mappers + archive reasons) → T043 → T046 → US1 checkpoint, then US2/US3 test gaps, then US5→US7→US6 builds, then Polish/CI.

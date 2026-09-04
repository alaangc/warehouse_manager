---

description: "Dependency-ordered implementation tasks for Warehouse Management Operations"
---

# Tasks: Warehouse Management Operations

**Input**: Design documents from `specs/001-warehouse-management/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/openapi.yaml`, and `quickstart.md`

**Tests**: Required by the project constitution. Within each story, create the listed
tests first, confirm they fail for the intended missing behavior, then implement until
they pass.

**Organization**: Tasks are grouped by user story so each story produces an
independently demonstrable increment. Shared infrastructure appears only in Setup and
Foundational phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its phase prerequisites because it changes
  independent files and does not depend on another incomplete task in the same group.
- **[Story]**: Maps the task to the corresponding user story in `spec.md`.
- Every task names the concrete file or directory it must change.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the independently buildable TypeScript workspace and local
development environment selected in the implementation plan.

- [X] T001 Create the pnpm workspace manifests and planned directory skeleton in `package.json`, `pnpm-workspace.yaml`, `apps/api/`, `apps/web/`, `packages/contracts/`, `packages/config/`, `database/`, and `tests/e2e/`
- [X] T002 Pin Node.js 24 LTS and the pnpm release and add root lifecycle scripts in `.nvmrc`, `.npmrc`, and `package.json`
- [X] T003 [P] Configure strict TypeScript 6 ESM presets for browser, Node, and tests in `packages/config/tsconfig.base.json`, `packages/config/tsconfig.node.json`, and `packages/config/tsconfig.web.json`
- [X] T004 [P] Configure ESLint, Prettier, and repository-wide format/lint scripts in `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, and `package.json`
- [X] T005 [P] Initialize the Express 5 API package with the pinned runtime dependencies, including `decimal.js` and `@js-temporal/polyfill`, and its build/dev scripts in `apps/api/package.json`, `apps/api/tsconfig.json`, and `apps/api/src/main.ts`
- [X] T006 [P] Initialize the React 19.2/Vite 8 application and its independent build scripts in `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, and `apps/web/src/main.tsx`
- [X] T007 [P] Initialize the Zod/OpenAPI contract package and generated-type exports in `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, and `packages/contracts/src/index.ts`
- [X] T008 [P] Configure PostgreSQL 18 development and isolated test services in `compose.yaml` and `database/docker/init-test-db.sql`
- [X] T009 [P] Add safe environment templates, generated-document directories, and secret exclusions in `.env.example`, `apps/api/.env.example`, `.gitignore`, and `var/documents/.gitkeep`

**Checkpoint**: `apps/api` and `apps/web` install, type-check, and build independently;
the PostgreSQL development/test services start without application code.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the trusted API boundary, exact arithmetic, persistence,
authentication, contracts, auditing, and test harnesses needed by every story.

**Critical**: No user-story implementation begins until this phase passes.

- [X] T010 [P] Configure Vitest projects and coverage thresholds for API, web, and shared packages in `vitest.workspace.ts`, `apps/api/vitest.config.ts`, and `apps/web/vitest.config.ts`
- [X] T011 [P] Configure Chromium, Firefox, and WebKit projects with isolated test data hooks in `playwright.config.ts` and `tests/e2e/support/test-fixtures.ts`
- [X] T012 [P] Build the PostgreSQL 18 Testcontainers harness and database reset helpers in `apps/api/tests/support/postgres-container.ts` and `apps/api/tests/support/reset-database.ts`
- [X] T013 [P] Implement strict startup environment validation for database, session, origin, timezone, currency, logging, and document storage in `apps/api/src/config/env.ts` and `apps/api/tests/unit/config/env.test.ts`
- [X] T014 Implement the Kysely/pg pool, database type entry point, and immutable ordered migrator in `apps/api/src/db/database.ts`, `apps/api/src/db/types.ts`, and `apps/api/src/db/migrate.ts`
- [X] T015 Create the base migration for the stable-UUID business-settings singleton, users, sessions, idempotency requests, append-only audit events, runtime/migration roles, and restrictive ledger privileges in `database/migrations/001_foundation.ts`
- [X] T016 Create deterministic development/test seeds for the 50% partner rate, America/Hermosillo timezone, Magdalena, Caborca, Administrator, and Driver fixtures in `database/seeds/001_foundation.ts`
- [X] T017 [P] Write failing exact-arithmetic tests for decimal parsing, quantity precision, line rounding, total summation, and 50% partner share in `apps/api/tests/unit/shared/money.test.ts`
- [X] T018 Implement the configured `decimal.js` money/quantity value objects and half-away-from-zero rounding policy in `apps/api/src/shared/money.ts` and `apps/api/src/shared/quantity.ts`
- [X] T019 [P] Write failing integration tests for Serializable retries, deadlock handling, idempotency replay/hash conflicts, mutation rollback when audit insertion fails, no success audit after mutation rollback, and bounded retry exhaustion in `apps/api/tests/integration/shared/transaction-idempotency.test.ts`
- [X] T020 Implement deterministic lock ordering and bounded Serializable transaction retries in `apps/api/src/db/serializable-transaction.ts`
- [X] T021 Implement persisted idempotency acquisition, canonical request hashing, completion, and replay in `apps/api/src/shared/idempotency/idempotency-repository.ts` and `apps/api/src/shared/idempotency/idempotency-service.ts`
- [X] T022 Implement the typed mutation-to-audit action registry and append-only AuditWriter with field allowlists, secret filtering, same-transaction participation, and rollback-on-audit-failure behavior in `apps/api/src/shared/audit/audit-actions.ts`, `apps/api/src/shared/audit/audit-service.ts`, and `apps/api/src/shared/audit/audit-types.ts`
- [X] T023 [P] Write failing Supertest coverage for login/session/logout, CSRF enforcement, same-origin checks, role denial, RFC 9457 errors, and sensitive-detail redaction in `apps/api/tests/contract/foundation/auth-errors.contract.test.ts`
- [X] T024 Implement request IDs, Pino redaction, safe RFC 9457 mapping, 404 handling, and health/readiness routes in `apps/api/src/http/request-context.ts`, `apps/api/src/http/logger.ts`, `apps/api/src/http/problem-handler.ts`, and `apps/api/src/http/health-routes.ts`
- [X] T025 Implement Argon2id login, PostgreSQL-backed opaque sessions, secure `__Host-` cookies, CSRF tokens, origin checks, rotation, logout, and throttling in `apps/api/src/auth/auth-service.ts`, `apps/api/src/auth/session-store.ts`, and `apps/api/src/auth/auth-routes.ts`
- [X] T026 Implement Administrator/Driver policy helpers and resource-level authorization middleware in `apps/api/src/auth/authorization.ts` and `apps/api/src/auth/policies.ts`
- [X] T027 Implement the shared Zod registry, decimal/UUID/pagination schemas, response serialization, and RFC 9457 schema in `packages/contracts/src/registry.ts`, `packages/contracts/src/common-schemas.ts`, and `packages/contracts/src/problem-schemas.ts`
- [X] T028 Generate and lint OpenAPI 3.1.2 plus frontend types, and compare generated semantics with the planning contract in `packages/contracts/scripts/generate-openapi.ts`, `packages/contracts/scripts/check-contract.ts`, `packages/contracts/openapi.yaml`, and `packages/contracts/src/generated/api-types.ts`
- [X] T029 Implement the credentialed frontend fetch adapter with CSRF/idempotency headers, Problem Details decoding, timeouts, cancellation, and explicit 401/403/409/422 handling in `apps/web/src/lib/api/client.ts`, `apps/web/src/lib/api/problem.ts`, and `apps/web/src/lib/api/idempotency.ts`
- [X] T030 Implement and test the React Router/MUI/TanStack Query application shell, login screen, CSRF-restoring authenticated-session bootstrap, unauthenticated redirects, logout action, role-aware navigation, and global loading/error boundaries in `apps/api/src/auth/auth-routes.ts`, `apps/api/src/auth/session-store.ts`, `apps/api/tests/contract/foundation/auth-errors.contract.test.ts`, `apps/web/src/app/router.tsx`, `apps/web/src/app/providers.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/session.ts`, `apps/web/src/features/auth/login-page.tsx`, and `apps/web/tests/auth/auth-ui.test.tsx`

**Checkpoint**: Foundation contract tests pass; startup rejects invalid configuration;
login, sessions, CSRF, RBAC, Problem Details, exact decimals, migrations, idempotency,
transactions, logs, and audits are reusable by all stories.

---

## Phase 3: User Story 1 - Control Inventory by Location (Priority: P1) — MVP

**Goal**: Administrators maintain the product catalog and perform fully traceable,
nonnegative inventory operations across Magdalena, Caborca, and route stock locations.

**Independent Test**: Create a product, enter stock, transfer it between branches,
adjust it, trigger a low-stock alert, reverse an operation, and prove balances equal the
immutable movement history while an insufficient/concurrent decrement changes nothing.

### Tests for User Story 1

- [X] T031 [P] [US1] Write failing OpenAPI/Supertest tests for product/unit/category/location/vehicle CRUD, inventory balance/history filters, assigned-route-only Driver movement access, entry/exit/adjustment/transfer/reversal commands, decimal strings, and Administrator/Driver authorization in `apps/api/tests/contract/inventory/inventory.contract.test.ts`
- [X] T032 [P] [US1] Write failing PostgreSQL integration tests for movement/balance atomicity, required reasons, archival history, low-stock thresholds, compensating reversals, and same-transaction audit presence/failure rollback for catalog and inventory mutations in `apps/api/tests/integration/inventory/inventory-ledger.test.ts`
- [X] T033 [P] [US1] Write failing concurrent last-unit, deterministic-lock, negative-balance, transaction-rollback, and idempotent-retry tests in `apps/api/tests/integration/inventory/inventory-concurrency.test.ts`
- [X] T034 [P] [US1] Write failing React component tests for product forms, inventory filters, alerts, operation forms, conflict errors, and movement history in `apps/web/tests/inventory/inventory-ui.test.tsx`
- [X] T035 [P] [US1] Write the failing independent inventory walkthrough for Administrator and denied Driver actions in `tests/e2e/us1-inventory.spec.ts`

### Implementation for User Story 1

- [X] T036 [US1] Create catalog, vehicle, route-core, branch/route stock-location, balance, operation, movement, constraints, search indexes, and append-only grants in `database/migrations/002_catalog_inventory.ts`
- [X] T037 [P] [US1] Add product/unit/category/location builders and inventory assertion helpers in `apps/api/tests/support/catalog-factories.ts` and `apps/api/tests/support/inventory-assertions.ts`
- [X] T038 [P] [US1] Implement catalog repositories with normalized uniqueness, optimistic versions, and archive-not-delete behavior in `apps/api/src/modules/catalog/catalog-repository.ts`
- [X] T039 [US1] Implement ordered balance locking, conditional decrements, immutable movement insertion, and ledger reproduction queries in `apps/api/src/modules/inventory/inventory-repository.ts`
- [X] T040 [US1] Implement product/unit/category/location/vehicle validation, lifecycle rules, active-route vehicle guards, and same-transaction audit emission in `apps/api/src/modules/catalog/catalog-service.ts`
- [X] T041 [US1] Implement atomic entry, manual exit, transfer, positive/negative adjustment, reversal, low-stock alert, idempotent retry, and same-transaction audit emission in `apps/api/src/modules/inventory/inventory-service.ts`
- [X] T042 [US1] Implement catalog/inventory Zod schemas, OpenAPI registrations, controllers, and `/api/v1` routes in `packages/contracts/src/catalog-schemas.ts`, `packages/contracts/src/inventory-schemas.ts`, and `apps/api/src/modules/inventory/inventory-routes.ts`
- [X] T043 [P] [US1] Implement Administrator product, unit, category, location, and vehicle management screens in `apps/web/src/features/catalog/catalog-pages.tsx` and `apps/web/src/features/catalog/catalog-forms.tsx`
- [X] T044 [P] [US1] Implement role-filtered inventory search, branch/route balances, pagination, and low-stock alerts in `apps/web/src/features/inventory/inventory-page.tsx` and `apps/web/src/features/inventory/inventory-queries.ts`
- [X] T045 [US1] Implement entry, manual exit, transfer, adjustment, and reversal forms with explicit validation/conflict/server failure states in `apps/web/src/features/inventory/inventory-operation-form.tsx`
- [X] T046 [US1] Implement immutable movement-history views and complete the US1 contract, integration, component, and E2E pass in `apps/web/src/features/inventory/movement-history.tsx` and `tests/e2e/us1-inventory.spec.ts`

**Checkpoint**: US1 is deployable as the inventory-control MVP and passes SC-001,
SC-002, and applicable authorization/audit checks independently; the exact SC-006
scale profile is executed at the cross-cutting T138 release gate.

---

## Phase 4: User Story 2 - Record a Customer Sale (Priority: P1)

**Goal**: A Driver on an active route selects an existing customer, receives the
authoritative price, and confirms one exact, atomic, retry-safe sale and Sale Ticket; only an
Administrator may cancel it.

**Independent Test**: Using seeded customer, price, En Route route, and route inventory,
confirm and retry a sale; verify one preserved sale/Sale Ticket/movement set, then exercise
anonymous, unavailable, foreign-route, price-override, cancellation, and rollback cases.

### Tests for User Story 2

- [X] T047 [P] [US2] Write failing unit tests for customer-price precedence, effective intervals, product/category/unit snapshots, decimal line rounding, and payment-method preservation in `apps/api/tests/unit/sales/pricing.test.ts`
- [X] T048 [P] [US2] Write failing OpenAPI/Supertest tests for sale quote/confirmation, Sale Ticket detail, Driver-own sale list/detail history, another-Driver list/filter/direct-ID denial, Administrator-wide history, cancellation, decimal serialization, and Problem Details in `apps/api/tests/contract/sales/sales.contract.test.ts`
- [X] T049 [P] [US2] Write failing direct-SQL/concurrent CustomerPrice exclusion tests for overlap rejection, adjacent acceptance, unbounded/inactive ranges, and SQLSTATE 23P01 in `apps/api/tests/integration/sales/customer-price-constraint.test.ts`, plus failing atomic Sale/Sale Ticket/movement/audit, rollback, replay/hash-conflict, and simultaneous last-stock tests in `apps/api/tests/integration/sales/sale-confirmation.test.ts`
- [X] T050 [P] [US2] Write failing integration tests for one-time Administrator cancellation to En Route inventory versus origin branch after return/closure, including mandatory same-transaction audit presence and failure rollback, in `apps/api/tests/integration/sales/sale-cancellation.test.ts`
- [X] T051 [P] [US2] Write failing React tests for customer/product selection, quote refresh, locked prices, multiline totals, submission uncertainty, retry, and server errors in `apps/web/tests/sales/sale-form.test.tsx`
- [X] T052 [P] [US2] Write the failing end-to-end Sale Ticket, duplicate retry, cancellation, Driver-own history, and another-Driver history-denial walkthrough in `tests/e2e/us2-sales.spec.ts`

### Implementation for User Story 2

- [X] T053 [US2] Provision `btree_gist` through the migration owner and create customer, customer-price, sale, sale-line, cancellation, and Sale Ticket tables with exact numeric/snapshot constraints, the CustomerPrice validity-endpoint check and partial GiST exclusion for active half-open ranges, one-Sale-Ticket-per-Sale uniqueness, and route-core foreign keys in `database/migrations/003_sales_core.ts`
- [X] T054 [P] [US2] Add seeded active/inactive customers, price intervals, vehicle, En Route route, route stock, and sale builders in `apps/api/tests/support/sales-factories.ts`
- [X] T055 [P] [US2] Implement customer-price lookup plus sale/Sale Ticket persistence and SQL-scoped Driver-own sale-history repositories in `apps/api/src/modules/customers/customer-price-repository.ts` and `apps/api/src/modules/sales/sale-repository.ts`
- [X] T056 [US2] Implement authoritative price selection, historical snapshots, decimal line calculations, and advisory availability quotes in `apps/api/src/modules/sales/pricing-service.ts`
- [X] T057 [US2] Implement Serializable sale confirmation with route authorization, all-lines stock locking, one Sale Ticket, movements, same-transaction audit, and idempotency in `apps/api/src/modules/sales/sale-service.ts`
- [X] T058 [US2] Implement Administrator-only cancellation with mandatory reason, exact inverse movements, state-dependent destination, preservation, single-cancellation enforcement, and same-transaction audit in `apps/api/src/modules/sales/cancellation-service.ts`
- [X] T059 [US2] Implement sale/customer Zod schemas, OpenAPI operations, controllers, SQL-scoped Driver-own list/detail history, another-Driver denial, and Administrator-wide history in `packages/contracts/src/sales-schemas.ts` and `apps/api/src/modules/sales/sales-routes.ts`
- [X] T060 [P] [US2] Implement existing-customer and active-route product lookup with quote-driven exact price display in `apps/web/src/features/sales/sale-queries.ts` and `apps/web/src/features/sales/customer-product-picker.tsx`
- [X] T061 [US2] Implement the multiline sale form with React Hook Form, non-editable prices, decimal-string totals, payment method, stable client operation ID, and explicit confirmation in `apps/web/src/features/sales/sale-form.tsx`
- [X] T062 [US2] Implement uncertain-response recovery, idempotent resubmission, sale detail, Sale Ticket result, Driver-own completed-sale history, and Administrator cancellation UI in `apps/web/src/features/sales/sale-result.tsx`, `apps/web/src/features/sales/driver-sale-history.tsx`, and `apps/web/src/features/sales/sale-cancellation-dialog.tsx`
- [X] T063 [US2] Complete generated contract/type synchronization and make all US2 unit, contract, integration, component, and E2E tests pass in `packages/contracts/openapi.yaml` and `tests/e2e/us2-sales.spec.ts`

**Checkpoint**: US2 independently proves exact pricing, one-time stock deduction,
Sale Ticket creation, retry safety, rollback, denied Driver cancellation, scoped Driver
history, and preserved business history.

---

## Phase 5: User Story 3 - Run and Reconcile a Delivery Route (Priority: P1)

**Goal**: An Administrator assigns a route; its Driver confirms the load and performs
valid transitions; an Administrator reconciles physical returns/differences and closes
the route at zero without rewriting history.

**Independent Test**: Move one route through Preparing, En Route, Returned, and Closed;
prove load/return atomicity, role restrictions, overlap constraints, reconciliation
identity, difference adjustments/reasons, zero route inventory, and post-close locking.

### Tests for User Story 3

- [X] T064 [P] [US3] Write failing unit tests for the route transition table, actor permissions, load preconditions, signed difference convention, and reconciliation equation in `apps/api/tests/unit/routes/route-domain.test.ts`
- [X] T065 [P] [US3] Write failing OpenAPI/Supertest tests for route create/detail/list, draft/confirm load, start, return, reconciliation, close, complete route movement history, assigned-Driver access in every state, another-Driver denial, and invalid commands in `apps/api/tests/contract/routes/routes.contract.test.ts`
- [X] T066 [P] [US3] Write failing PostgreSQL tests for full-load rollback, simultaneous driver/vehicle assignment, route-stock movements, reconciliation adjustments, zero-at-close, immutable Closed routes, and same-transaction audit presence/failure rollback for every route mutation class in `apps/api/tests/integration/routes/route-lifecycle.test.ts`
- [X] T067 [P] [US3] Write failing authorization tests proving only the assigned Driver loads/starts/returns and reads that route's full history, another Driver cannot list/filter/directly access it, and only an Administrator creates/reconciles/closes in `apps/api/tests/integration/routes/route-authorization.test.ts`
- [X] T068 [P] [US3] Write failing React tests for assignment, load, state actions, reconciliation reasons, conflict recovery, and closed history in `apps/web/tests/routes/route-workflow.test.tsx`
- [X] T069 [P] [US3] Write the failing end-to-end route lifecycle with shortage, overage, retry, invalid transition, assigned-Driver Closed-route history, another-Driver denial, and post-close edit attempts in `tests/e2e/us3-routes.spec.ts`

### Implementation for User Story 3

- [X] T070 [US3] Create route-load/line and route-reconciliation/line tables plus partial active driver/vehicle indexes and state/reason constraints in `database/migrations/004_route_lifecycle.ts`
- [X] T071 [P] [US3] Implement route, load, reconciliation, and SQL-scoped assigned-Driver history persistence with conditional state/version updates and complete movement projections in `apps/api/src/modules/routes/route-repository.ts`
- [X] T072 [US3] Implement Administrator route creation/assignment and Driver draft/full-load confirmation with atomic branch-to-route transfer and same-transaction audit events in `apps/api/src/modules/routes/route-load-service.ts`
- [X] T073 [US3] Implement assigned-Driver start/return commands with conditional transitions, idempotency, same-transaction audit events, and sale blocking after return in `apps/api/src/modules/routes/route-transition-service.ts`
- [X] T074 [US3] Implement Administrator reconciliation, shortage/overage adjustments, mandatory difference reasons, origin returns, zero-balance proof, closure locking, and same-transaction audit events in `apps/api/src/modules/routes/route-reconciliation-service.ts`
- [X] T075 [US3] Implement route Zod schemas, OpenAPI operations, controllers, SQL-scoped assigned-Driver list/detail authorization, another-Driver denial, and route-detail load/movement/sale/reconciliation/closure projections in `packages/contracts/src/route-schemas.ts` and `apps/api/src/modules/routes/route-routes.ts`
- [X] T076 [P] [US3] Implement Administrator route creation, assignment, list, and detail screens in `apps/web/src/features/routes/admin-route-pages.tsx`
- [X] T077 [P] [US3] Implement Driver draft load, confirmation, start, return, and active-route inventory screens in `apps/web/src/features/routes/driver-route-pages.tsx`
- [X] T078 [US3] Implement Administrator physical-return/reconciliation forms with calculated differences, required reasons, close confirmation, and conflict states in `apps/web/src/features/routes/reconciliation-page.tsx`
- [X] T079 [US3] Implement assigned-Driver and Administrator route load/movement/sale/reconciliation/closure timeline history with Closed-route read-only behavior, then pass all US3 tests in `apps/web/src/features/routes/route-history.tsx` and `tests/e2e/us3-routes.spec.ts`

**Checkpoint**: US3 independently proves every allowed/denied state transition,
temporary route inventory, full reconciliation, zero-at-close, overlap prevention, and
historical integrity.

---

## Phase 6: User Story 4 - Manage Customers and Pricing (Priority: P2)

**Goal**: Administrators manage individual customers and non-overlapping per-product
prices while Drivers can only find/select existing customers and historical sales keep
their applied values.

**Independent Test**: Create/edit/archive a customer, add/replace/deactivate a special
price, verify standard fallback and purchase history, and prove Driver mutation attempts
are denied without altering data.

### Tests for User Story 4

- [X] T080 [P] [US4] Write failing OpenAPI/Supertest tests for customer CRUD/archive, role-filtered fields, customer prices/deactivation, search, and purchase history in `apps/api/tests/contract/customers/customers.contract.test.ts`
- [ ] T081 [P] [US4] Write failing PostgreSQL service-lifecycle tests for CustomerPrice creation/replacement/deactivation, standard fallback, archival, optimistic conflicts, permissions, and same-transaction customer/price audit presence and failure rollback in `apps/api/tests/integration/customers/customer-pricing.test.ts`
- [ ] T082 [P] [US4] Write failing React tests for customer forms/search, special-price lifecycle, history, archive confirmation, and Driver read-only behavior in `apps/web/tests/customers/customer-management.test.tsx`
- [ ] T083 [P] [US4] Write the failing end-to-end customer, pricing, fallback, history, and denial walkthrough in `tests/e2e/us4-customers.spec.ts`

### Implementation for User Story 4

- [X] T084 [P] [US4] Extend customer repositories with normalized search, role-filtered projections, purchase history, archival, and optimistic updates in `apps/api/src/modules/customers/customer-repository.ts`
- [X] T085 [US4] Implement Administrator customer lifecycle rules, active-route selection restrictions, historical preservation, and same-transaction audit events in `apps/api/src/modules/customers/customer-service.ts`
- [X] T086 [US4] Implement non-overlapping customer-price creation, replacement, deactivation, standard fallback, SQLSTATE 23P01 conflict mapping, and same-transaction audit events in `apps/api/src/modules/customers/customer-price-service.ts`
- [X] T087 [US4] Implement customer/price/history Zod schemas, OpenAPI handlers, and Administrator/Driver response filtering in `packages/contracts/src/customer-schemas.ts` and `apps/api/src/modules/customers/customer-routes.ts`
- [X] T088 [P] [US4] Implement Administrator customer search, create/edit/archive forms, and conflict handling in `apps/web/src/features/customers/customer-pages.tsx` and `apps/web/src/features/customers/customer-form.tsx`
- [X] T089 [P] [US4] Implement per-product price lifecycle and preserved purchase-history views in `apps/web/src/features/customers/customer-prices.tsx` and `apps/web/src/features/customers/customer-history.tsx`
- [ ] T090 [US4] Complete contract/type synchronization and pass all US4 contract, integration, component, and E2E tests in `packages/contracts/openapi.yaml` and `tests/e2e/us4-customers.spec.ts`

**Checkpoint**: US4 works independently against existing sales and proves protected
customer maintenance, exact price fallback, archival, and reproducible history.

---

## Phase 7: User Story 5 - Close Cash and Review Operations (Priority: P2)

**Goal**: Administrators produce exact, reproducible cash closes and operational
reports for API-resolved local-calendar periods, with exactly one current immutable
cash close per exact period and traceable superseding corrections.

**Independent Test**: From fixed sales spanning reporting groups, Sunday/Monday, month
end, and an offset transition, produce DAY/WEEK/MONTH reports from local anchor dates;
create/retry/conflict/correct a cash close, race independent creates and corrections,
then change catalog data and prove every immutable version remains reproducible.

### Tests for User Story 5

- [ ] T091 [P] [US5] Write failing unit tests for DAY local-midnight, Monday-based WEEK, calendar MONTH, `[start,end)` inclusion, independent IANA boundary resolution across 23/25-hour offset transitions, invalid period inputs, reporting groups, exact gross total, fixed 50% share, line/category sums, and rounding in `apps/api/tests/unit/reports/reporting-period.test.ts` and `apps/api/tests/unit/reports/financial-calculations.test.ts`
- [ ] T092 [P] [US5] Write failing OpenAPI/Supertest tests for `periodKind` plus `anchorDate` report requests; cash-close create/list/detail/correction; current/superseded fields and links; same-key replay; `CASH_CLOSE_PERIOD_ALREADY_CURRENT`, `CASH_CLOSE_NOT_CURRENT`, `IDEMPOTENCY_KEY_REUSED`, and `INVALID_REPORTING_PERIOD`; report snapshots, decimal strings, filters, pagination, and Administrator-only access in `apps/api/tests/contract/reports/reports.contract.test.ts`
- [ ] T093 [P] [US5] Write failing PostgreSQL integration tests for resolved-period snapshots, cancelled-sale treatment, same-key replay, different-key duplicate conflict, exactly one current-period pointer, same-period non-branching supersession, stale correction rejection, concurrent create/correction races, pointer compare-and-swap, immutable predecessor retrieval, catalog-change reproducibility, and whole-transaction rollback when snapshot, pointer, idempotency, or audit writes fail in `apps/api/tests/integration/reports/cash-close-currentness.test.ts` and `apps/api/tests/integration/reports/cash-close-reporting.test.ts`
- [ ] T094 [P] [US5] Write failing React tests for local anchor-date and period-kind controls, resolved boundary display, cash-close confirmation, current/superseded history, mandatory-reason correction, stale/duplicate conflict handling, exact totals, empty/error states, and report tables in `apps/web/tests/reports/reporting-ui.test.tsx` and `apps/web/tests/reports/cash-close-ui.test.tsx`
- [ ] T095 [P] [US5] Write the failing end-to-end DAY/WEEK/MONTH boundary, identical retry, separate duplicate conflict, immutable correction chain, concurrent-currentness, and reproducible cash-close walkthrough in `tests/e2e/us5-reporting.spec.ts`

### Implementation for User Story 5

- [ ] T096 [US5] Create immutable cash-close/line/sale and report-snapshot tables plus `CashCloseCurrentPeriod`, storing period kind, anchor date, captured timezone, resolved instants, unique nullable predecessor, mandatory correction reason, matching composite period keys, same-period/non-branching constraint trigger, exact numeric snapshots, current-pointer indexes, and restrictive history guarantees in `database/migrations/005_reporting.ts`
- [ ] T097 [P] [US5] Implement indexed report/cash-close aggregations, immutable version reads, status and predecessor/successor projections, current-period insertion, pointer locking and compare-and-swap, and paginated current/superseded queries in `apps/api/src/modules/reports/report-repository.ts` and `apps/api/src/modules/reports/cash-close-repository.ts`
- [ ] T098 [US5] Implement Serializable cash-close creation and correction with exact 50% gross calculations, stored inputs/results and contributing sales, persisted idempotency, one-current-period conflict mapping, mandatory correction reason, immutable same-period successor insertion, atomic pointer replacement, stale-correction rejection, and same-transaction old-to-new audit in `apps/api/src/modules/reports/cash-close-service.ts`
- [ ] T099 [US5] Implement authoritative `periodKind`/`anchorDate` resolution with pinned `@js-temporal/polyfill`, local-midnight DAY, Monday WEEK, calendar MONTH, independently resolved `[start,end)` IANA boundaries, plus sales-by-driver, best-product, inventory-by-branch, financial-summary, immutable report snapshots, and same-transaction snapshot audit in `apps/api/src/modules/reports/reporting-period.ts` and `apps/api/src/modules/reports/report-service.ts`
- [ ] T100 [US5] Implement report/cash-close Zod schemas and OpenAPI operations for calendar-period requests, resolved boundaries, current/superseded status and links, correction reasons, stable 409/422 codes, Administrator policies, controllers, and pagination in `packages/contracts/src/report-schemas.ts` and `apps/api/src/modules/reports/report-routes.ts`
- [ ] T101 [P] [US5] Implement cash-close creation/list/detail/correction screens with exact decimal display, source drill-down, current/superseded labels, immutable version navigation, mandatory reason, and explicit idempotency/stale/duplicate conflict states in `apps/web/src/features/reports/cash-close-pages.tsx`
- [ ] T102 [P] [US5] Implement DAY/WEEK/MONTH plus local anchor-date report controls, resolved business-timezone boundary display, operational tables, loading/empty/validation/failure states, and report-snapshot action in `apps/web/src/features/reports/report-pages.tsx`
- [ ] T103 [US5] Complete contract/type synchronization and pass all US5 calculation, contract, integration, component, and E2E tests in `packages/contracts/openapi.yaml` and `tests/e2e/us5-reporting.spec.ts`

**Checkpoint**: US5 independently proves exact/reproducible finance, fixed reporting
groups, Monday/local-midnight calendar boundaries including offset changes, one current
cash close per exact period, immutable non-branching corrections, rollback/retry safety,
and Administrator-only access.

---

## Phase 8: User Story 7 - Administer Users and Operational Settings (Priority: P2)

**Goal**: Administrators manage users, business/printer settings, and role-specific
overviews; Drivers can select/connect/test only an approved printer without gaining
broader settings access.

**Independent Test**: Create a Driver, verify permitted/denied actions and overview,
select/test an approved printer, deactivate the account, and prove sessions are revoked
while historical attribution and active-route constraints remain intact.

### Tests for User Story 7

- [ ] T104 [P] [US7] Write failing unit tests for role changes, password rehash/rotation, session revocation, business-setting constraints, safe audit snapshots/actions, and role-filtered overview composition in `apps/api/tests/unit/users/user-administration.test.ts`
- [ ] T105 [P] [US7] Write failing OpenAPI/Supertest tests for users, business settings, printer profiles, personal printer preference, document-free TEST_PRINT attempts that require a printer profile, overview, and all Administrator/Driver denial paths in `apps/api/tests/contract/users/user-settings.contract.test.ts`
- [ ] T106 [P] [US7] Write failing integration tests for deactivation/session revocation, active-route driver/vehicle conflicts, immutable actor history, printer-profile archival, preference isolation, and same-transaction audit presence/failure rollback for user, setting, printer-profile, and preference mutations in `apps/api/tests/integration/users/user-settings.test.ts`
- [ ] T107 [P] [US7] Write failing React tests for user/settings forms, role navigation, limited Driver printer controls, unsupported browser, permission denial, and test-result states in `apps/web/tests/users/user-settings-ui.test.tsx`
- [ ] T108 [P] [US7] Write the failing end-to-end user creation, role denial, printer test, deactivation, and historical attribution walkthrough in `tests/e2e/us7-user-settings.spec.ts`

### Implementation for User Story 7

- [ ] T109 [US7] Create printer-profile and user-printer-preference tables plus the append-only OutputAttempt base table with nullable document reference/type, transport metadata, archival/version constraints, per-user uniqueness, and CHECK constraints requiring a printer and no document for TEST_PRINT in `database/migrations/006_printer_settings.ts`
- [ ] T110 [US7] Implement Administrator user CRUD/activation/deactivation/role/password operations with active-route guards, session revocation, safe before/after snapshots, and same-transaction audit events in `apps/api/src/modules/users/user-admin-service.ts`
- [ ] T111 [US7] Implement currency/timezone setting updates for future operations with stable BusinessSetting audit identity, same-transaction audit emission, immutable 50% share, and historical snapshots in `apps/api/src/modules/settings/business-settings-service.ts`
- [ ] T112 [US7] Implement printer-profile administration, per-user preference isolation, same-transaction configuration audit emission, and safe document-free TEST_PRINT recording that requires an approved printer profile in `apps/api/src/modules/printers/printer-settings-service.ts`
- [ ] T113 [US7] Implement users/settings/printers/overview Zod schemas, OpenAPI routes, resource policies, role-filtered projections, and the TEST_PRINT request variant without a document ID in `packages/contracts/src/administration-schemas.ts` and `apps/api/src/modules/users/administration-routes.ts`
- [ ] T114 [P] [US7] Implement role-specific overview queries and API composition in `apps/api/src/modules/overview/overview-service.ts` and `apps/api/src/modules/overview/overview-routes.ts`
- [ ] T115 [P] [US7] Implement Administrator user and business-setting screens with conflict/deactivation explanations in `apps/web/src/features/administration/user-settings-pages.tsx`
- [ ] T116 [P] [US7] Implement Administrator approved-printer profile management in `apps/web/src/features/printers/printer-profile-page.tsx`
- [ ] T117 [US7] Implement the PrinterAdapter boundary plus Driver selection, Web Bluetooth capability/permission checks, connect/test/disconnect states, and role overview UI in `apps/web/src/features/printers/printer-adapter.ts`, `apps/web/src/features/printers/web-bluetooth-adapter.ts`, `apps/web/src/features/printers/printer-preference-page.tsx`, and `apps/web/src/features/overview/overview-page.tsx`

**Checkpoint**: US7 independently proves user lifecycle, immediate access revocation,
historical actor preservation, operational-setting boundaries, and limited Driver
printer configuration.

---

## Phase 9: User Story 6 - Save, Share, and Print Operational Documents (Priority: P3)

**Goal**: Authorized users generate canonical PDFs from committed records and download
or share all four document types; only Sale Tickets, confirmed route loads, and cash
closes print on approved BLE hardware, with explicit retry/unknown states that never
repeat the source transaction. Users can browse source-authorized document and
output-attempt history; reports remain portable-only.

**Independent Test**: Generate and download/share Sale Ticket/confirmed-route-load/
cash-close/report PDFs; print the first three, reject report PRINT/REPRINT before a
device write, simulate generation and partial-print failures, explicitly retry output,
and prove no sale/load/close is duplicated or rolled back. Seed multiple pages of
documents/attempts and prove Administrator-wide versus Driver source-scoped list,
filter, cursor, and direct-attempt behavior including Administrator-only TEST_PRINT.

### Tests for User Story 6

- [ ] T118 [P] [US6] Write failing unit tests for Sale Ticket/confirmed-route-load/cash-close/report PDF snapshots, stable filenames/hashes, all three printable ESC/POS templates, Spanish encoding, paper widths, chunk ordering, disconnect handling, and UNKNOWN/reprint rules in `apps/api/tests/unit/documents/pdf-rendering.test.ts` and `apps/web/tests/printers/printer-adapter.test.ts`
- [ ] T119 [P] [US6] Write failing OpenAPI/Supertest tests for the sole TICKET sale-document type, four valid document/source pairs, confirmed-only ROUTE_LOAD output, portable status/content, `GET /documents`, `GET /output-attempts`, and output-attempt detail; default limit 25 and maximum 100, stable opaque cursors, type/state/source/document/mode/time filters, all four Administrator portable and three printable types, Driver own-sale TICKET and assigned confirmed ROUTE_LOAD including Administrator-created outputs, Administrator-only TEST_PRINT history, direct/filter/cursor denial for other sources, DRAFT 409, REPORT print 422, and authorization before reuse/capability checks in `apps/api/tests/contract/documents/documents.contract.test.ts` and `apps/api/tests/contract/documents/document-history.contract.test.ts`
- [ ] T120 [P] [US6] Write failing direct-SQL tests for confirmed-RouteLoad DocumentOutput races, valid source pairs, history indexes, OutputAttempt composite references, printer requirements, TEST_PRINT null document, and REPORT print rejection; add integration tests for stable `(created_at DESC, id DESC)` keyset pagination without gaps/duplicates, principal/role/filter-bound cursor rejection, immutable Sale/confirmed-RouteLoad source authorization on document/attempt list and direct reads regardless of creator or attempt actor, Driver exclusion of CASH_CLOSE/REPORT/other-route/TEST_PRINT, no metadata/bytes/side effects on denial, retry isolation, and authorized canonical reuse in `apps/api/tests/integration/documents/document-output.test.ts`, `apps/api/tests/integration/documents/document-history.test.ts`, and `apps/api/tests/integration/documents/document-authorization.test.ts`
- [ ] T121 [P] [US6] Write failing React tests for status polling, download/share, paginated document/output-attempt history, filters and next-cursor states, attempt detail, Administrator TEST_PRINT visibility, Driver source-scoped Administrator-created records, hidden and server-denied unrelated/CASH_CLOSE/REPORT/DRAFT/TEST_PRINT history and actions, printable capability states, REPORT 422, unsupported Bluetooth, explicit reprint, and UNKNOWN states in `apps/web/tests/documents/document-output-ui.test.tsx` and `apps/web/tests/documents/document-history-ui.test.tsx`
- [ ] T122 [P] [US6] Write the failing cross-browser E2E flow for four Administrator PDFs; multiple pages of document/attempt history; Driver own/assigned access to new and Administrator-created outputs; cursor traversal; filters; direct attempt detail; manipulated cursor/filter/direct-ID/content/share/print/reprint denial for another Driver's TICKET, unassigned load, CASH_CLOSE, REPORT, TEST_PRINT, and DRAFT load without metadata or side effects; plus Chromium fake-transport coverage for the three printable types, REPORT rejection before device write, and explicit UNKNOWN reprint in `tests/e2e/us6-documents-printing.spec.ts` and `tests/e2e/us6-document-history.spec.ts`

### Implementation for User Story 6

- [ ] T123 [US6] Create DocumentOutput with four valid source-pair checks, source foreign keys, canonical uniqueness, unique `(id, document_type)`, stable history indexes, and a constraint trigger rejecting direct or racing ROUTE_LOAD inserts unless CONFIRMED; then upgrade OutputAttempt with copied document type, composite foreign key, `(created_at DESC, id DESC)` and document-history indexes, printer/mode/nullability checks, and database rejection of REPORT PRINT/REPRINT in `database/migrations/007_document_output.ts`
- [ ] T124 [P] [US6] Implement immutable source loaders plus document and output-attempt repositories with stable keyset pages, opaque principal/role/normalized-filter-bound cursors, default 25/max 100 limits, filters, and direct attempt reads; centralize TICKET `Sale.driver_id` and confirmed ROUTE_LOAD `Route.driver_id` authorization across create/reuse/list/detail/content/share/print/reprint/history regardless of output creator or attempt actor, with TEST_PRINT visible only to Administrators, in `apps/api/src/modules/documents/document-repository.ts`, `apps/api/src/modules/documents/output-attempt-repository.ts`, and `apps/api/src/shared/pagination/scoped-cursor.ts`
- [ ] T125 [P] [US6] Implement PDFKit Sale Ticket, route-load, cash-close, and report renderers with escaped data, exact values, stable filenames, and content hashes in `apps/api/src/modules/documents/pdf-renderers.ts`
- [ ] T126 [US6] Implement post-commit canonical document generation, status, storage, download/share, and retry behavior that authorizes from the immutable source before output reuse or side effects, locks and rejects DRAFT loads before DocumentOutput insertion, leaks no denied metadata, and creates no DocumentOutput or accepted OutputAttempt when authorization/source-state validation fails in `apps/api/src/modules/documents/document-service.ts`
- [ ] T127 [US6] Implement document Zod/OpenAPI routes for four source pairs, document list, output-attempt list/detail, cursor/filter validation, source-derived role policies on every metadata/content/history/output route, GENERATE/DOWNLOAD/SHARE versus PRINT/REPRINT versus TEST_PRINT shapes, Driver source/type denial, Administrator-only TEST_PRINT history, DRAFT 409, REPORT print 422, authorization-before-capability validation, printer requirements, no persistence on rejection, and PDF streaming headers in `packages/contracts/src/document-schemas.ts`, `packages/contracts/src/output-attempt-schemas.ts`, and `apps/api/src/modules/documents/document-routes.ts`
- [ ] T128 [P] [US6] Extend the existing Web Bluetooth adapter from connect/test to committed TICKET/ROUTE_LOAD/CASH_CLOSE BLE/GATT printing with filtered UUIDs, user gestures, chunking, and ambiguous-disconnect UNKNOWN state in `apps/web/src/features/printers/web-bluetooth-adapter.ts`
- [ ] T129 [P] [US6] Implement ESC/POS formatting for Sale Ticket, route-load, and cash-close output on 58/80mm paper with accented Spanish text, line wrapping, and reprint labels in `apps/web/src/features/printers/escpos-formatter.ts`
- [ ] T130 [P] [US6] Implement canonical request/status/download plus paginated document/output-attempt history and attempt-detail views with type/state/source/document/mode/time filters, cursor traversal, Administrator TEST_PRINT visibility, source-scoped Administrator-created outputs for Drivers, omitted DRAFT/forbidden actions, and explicit 403/409/generation/cursor/retry states in `apps/web/src/features/documents/document-center.tsx` and `apps/web/src/features/documents/document-history.tsx`
- [ ] T131 [P] [US6] Implement download fallback and user-gesture Web Share with `navigator.canShare` checks in `apps/web/src/features/documents/document-actions.tsx`
- [ ] T132 [US6] Implement role-and-source-capability-driven print/test/reprint UI that offers Drivers only own-sale TICKET and assigned confirmed ROUTE_LOAD actions, never offers DRAFT-load or REPORT printing, records STARTED/SUCCEEDED/FAILED/UNKNOWN attempts only after API acceptance, handles authoritative 403/409/422 responses, and never resubmits source mutations in `apps/web/src/features/printers/print-dialog.tsx`
- [ ] T133 [US6] Execute and record the BLE printer/browser/OS/protocol/encoding/failure matrix for Sale Ticket, confirmed route load, and cash close plus negative evidence that REPORT printing is rejected before device access in `specs/001-warehouse-management/evidence/printer-acceptance.md`

**Checkpoint**: US6 passes portable output, source-scoped history/pagination,
output-capability, isolation/retry, and approved physical-printer tests; REPORT remains
portable-only, TEST_PRINT history remains Administrator-only, and incompatible hardware
blocks FR-033/FR-047 rather than being silently accepted.

---

## Phase 10: Polish and Cross-Cutting Quality Gates

**Purpose**: Verify the complete product under production-like conditions and produce
the evidence required by the constitution.

- [ ] T134 [P] Implement empty-database and production-like migration verification, roll-forward, compatibility, and disposable PITR/restore scripts in `database/scripts/verify-migrations.ts`, `database/scripts/test-recovery.ts`, and `docs/operations/migrations.md`
- [ ] T135 [P] Configure clean-install, format, lint, type-check, independent builds, unit, contract, PostgreSQL integration, and Playwright CI jobs in `.github/workflows/ci.yml`
- [ ] T136 Enforce strict OpenAPI linting, generated-contract/type clean diffs, request/response validation, and breaking-change review in `redocly.yaml`, `packages/contracts/scripts/validate-runtime-contract.ts`, and `.github/workflows/ci.yml`
- [ ] T137 [P] Apply HTTPS proxy assumptions, CSP, `Permissions-Policy: bluetooth=(self)`, secure headers, rate limits, cookie flags, log redaction, and startup-secret checks in `apps/api/src/http/security.ts` and `docs/operations/security.md`
- [ ] T138 [P] Create a reproducible fixture with exactly 10,000 products, 10,000 customers, and 100,000 completed sales, then use 25 concurrent authenticated browser sessions for at least 400 warmed actions evenly rotating matching and no-results product/customer/inventory searches; measure from user action until loading ends, rows or explicit no-results are visible, identifying/relevant values render, and every caller-available result action is enabled; assert all four DOM conditions before completion and record end-to-end elapsed times, environment, seed, mix, percentiles, and SC-006 pass count in `tests/e2e/support/performance-fixture.ts`, `tests/e2e/performance-search.spec.ts`, and `specs/001-warehouse-management/evidence/search-performance.md`
- [ ] T139 Reuse the T138 acceptance fixture to run the warmed 25-user closed-loop profile with at least 400 uncached measurements evenly rotating Sale Ticket/confirmed-route-load/cash-close/report PDFs from distinct committed or confirmed sources and record environment, seed, mix, elapsed times, percentiles, and the SC-007 pass count in `tests/e2e/performance-success-criteria.spec.ts` and `specs/001-warehouse-management/evidence/document-performance.md`
- [ ] T140 Run the complete critical workflow suite on Chromium, Firefox, and WebKit and capture failures/retries in `specs/001-warehouse-management/evidence/cross-browser-e2e.md`
- [ ] T141 [P] Audit keyboard navigation, labels, focus/error behavior, and responsive layouts; freeze the standardized 15-minute introduction and versioned start-screen fixtures; then score five Drivers from handoff through a visibly available Sale Ticket for an exactly 10-line sale and five Administrators through mandatory-reason reconciliation and zero-inventory CLOSED state for a Returned route with exactly one difference. Permit ordinary corrections before final submission within the uninterrupted run, but fail the first attempt on rejected final submission, any restart, or any assistance; record role, fixture/script version, start/end timestamps, elapsed time, first-attempt result, assistance, failure reason, all-five Driver under-two-minute results, and at-least-9-of-10 first-attempt evidence in `apps/web/tests/accessibility/workflow-accessibility.test.tsx` and `specs/001-warehouse-management/evidence/usability.md`
- [ ] T142 [P] Add observable failure-state metrics/log checks for transactions, serialization exhaustion, authentication, cash-close duplicate/stale/concurrent-pointer conflicts, document generation, history-cursor rejection, and printer attempts in `apps/api/src/observability/operations.ts` and `apps/api/tests/integration/observability/failure-signals.test.ts`
- [ ] T143 [P] Add dependency/license/security scanning and ensure no licensed MUI X tier or browser secret enters the build in `.github/workflows/security.yml` and `scripts/check-browser-bundle-secrets.ts`
- [ ] T144 Execute every bootstrap, static, contract, test, migration, recovery, acceptance, and performance step from quickstart in a clean environment and record results in `specs/001-warehouse-management/evidence/quickstart-results.md`
- [ ] T145 Complete reviewer traceability from FR-001–FR-050 and SC-001–SC-012 to code/tests, verify every data-model audit-matrix mutation has same-transaction presence and failure-rollback evidence, record constitution compliance or time-bounded exceptions, and sign the release gate in `specs/001-warehouse-management/evidence/constitution-compliance.md`

**Checkpoint**: All applicable tests, migrations, recovery drills, contract checks,
hardware acceptance, observability checks, and reviewer gates pass in a clean
environment.

---

## Phase 11: Bilingual Interface

**Purpose**: Support immediate English and Spanish interface switching without
changing authoritative business data or regenerating completed work.

- [X] T146 Record FR-051–FR-053, SC-013, browser-local persistence, and locale-safe presentation in `specs/001-warehouse-management/spec.md` and `specs/001-warehouse-management/plan.md`
- [X] T147 Add English/Spanish resources, first-visit Spanish default, browser persistence, document language updates, and stable-code API error localization in `apps/web/src/i18n/` and `apps/web/src/lib/api/localized-error.ts`
- [X] T148 Add the shared Settings language selector and convert all currently implemented React screens to reactive translation keys in `apps/web/src/features/settings/settings-page.tsx` and `apps/web/src/`
- [X] T149 Add component coverage for immediate language switching and browser persistence in `apps/web/tests/settings/language-settings.test.tsx`

**Checkpoint**: English and Spanish can be selected from Settings, implemented pages
react immediately, and the same browser restores the saved selection.

---

## Dependencies and Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: No dependencies.
- **Phase 2 — Foundational**: Depends on Phase 1 and blocks every user story.
- **Phase 3 — US1 Inventory**: Depends only on Phase 2 and is the first MVP slice.
- **Phase 4 — US2 Sales**: Depends on Phase 2 and the US1 inventory ledger. Customer,
  price, route-core, and route-stock prerequisites are created here so the story remains
  independently testable with fixtures.
- **Phase 5 — US3 Routes**: Depends on US1 inventory and US2 sales because
  reconciliation accounts for both loaded and sold quantities.
- **Phase 6 — US4 Customers**: Depends on the US2 customer/price persistence slice;
  its CRUD/pricing UI can otherwise proceed independently of route work.
- **Phase 7 — US5 Reporting**: Depends on US1 inventory and US2 completed sales; it does
  not require document generation.
- **Phase 8 — US7 Administration**: Depends on Phase 2; its complete active-route
  deactivation test also consumes US3 route data.
- **Phase 9 — US6 Documents/Printing**: Depends on US2 Sale Tickets, US3 route loads, US5
  cash closes/report snapshots, and US7 printer profiles/preferences.
- **Phase 10 — Polish**: Depends on all stories selected for the release.
- **Phase 11 — Bilingual Interface**: Depends on the shared web shell and applies to
  every implemented user-facing screen without changing API or persistence behavior.

### User Story Dependency Graph

```text
Setup → Foundation ─┬→ US1 Inventory → US2 Sales ─┬→ US3 Routes ──┐
                   │                              ├→ US4 Customers │
                   │                              └→ US5 Reporting ─┤
                   └→ US7 Administration ─────────────────────────┤
                                                                  ▼
                                                          US6 Documents/Printing
                                                                  │
                                                               Polish
```

### Within Each User Story

1. Write the story's unit, contract, integration, component, and E2E tests and confirm
   the intended failures.
2. Apply the versioned migration and test fixtures.
3. Implement repositories and domain/application services.
4. Implement Zod/OpenAPI transport schemas and Express routes.
5. Implement React queries/forms/pages with explicit failure states.
6. Regenerate contracts/types and pass the story checkpoint independently.

## Parallel Opportunities

- After T001–T002, tasks T003–T009 can be split across workspace, API, web, contract,
  database, and environment files.
- In Foundation, test harnesses T010–T013 can run in parallel; after migrations exist,
  exact-math, transaction, and auth tests T017/T019/T023 target different files.
- In every user story, all tasks marked `[P]` in the test section can be written in
  parallel before implementation.
- After a story's API schemas stabilize, independent API repository/service work and
  React view work marked `[P]` can proceed concurrently using generated contract types.
- US4 customer administration and US7 administration can proceed in parallel after
  their stated persistence/route prerequisites; US5 reporting can proceed alongside
  US3 UI work once US2 sales are stable.

## Parallel Examples by User Story

### US1 Inventory

```text
T031 Contract tests | T032 Ledger tests | T033 Concurrency tests | T034 UI tests | T035 E2E test
T038 Catalog repository | T043 Catalog UI | T044 Inventory query UI
```

### US2 Sales

```text
T047 Pricing tests | T048 Contract tests | T049 Confirmation tests | T050 Cancellation tests | T051 UI tests | T052 E2E test
T055 Persistence repositories | T060 Lookup UI
```

### US3 Routes

```text
T064 Domain tests | T065 Contract tests | T066 Lifecycle tests | T067 Authorization tests | T068 UI tests | T069 E2E test
T071 Route repository | T076 Administrator UI | T077 Driver UI
```

### US4 Customers

```text
T080 Contract tests | T081 Integration tests | T082 UI tests | T083 E2E test
T084 Customer repository | T088 Customer UI | T089 Price/history UI
```

### US5 Reporting

```text
T091 Calculation tests | T092 Contract tests | T093 Snapshot tests | T094 UI tests | T095 E2E test
T097 Reporting repository | T101 Cash-close UI | T102 Report UI
```

### US7 Administration

```text
T104 Unit tests | T105 Contract tests | T106 Integration tests | T107 UI tests | T108 E2E test
T114 Overview API | T115 User/settings UI | T116 Printer-profile UI
```

### US6 Documents and Printing

```text
T118 Renderer/adapter tests | T119 Contract tests | T120 Output-isolation tests | T121 UI tests | T122 E2E test
T124 Repositories | T125 PDF renderers | T128 BLE adapter | T129 ESC/POS formatter | T130 Document UI | T131 Share/download UI
```

## Implementation Strategy

### MVP First: Inventory Control

1. Complete Setup (T001–T009).
2. Complete Foundation (T010–T030).
3. Complete US1 Inventory (T031–T046).
4. Stop and run the US1 checkpoint independently.
5. Demonstrate reliable product/location balances, movements, alerts, adjustments,
   transfers, reversals, authorization, rollback, and retry behavior before expanding.

### Incremental Delivery

1. Add US2 to create the sale/Sale Ticket revenue workflow.
2. Add US3 to operate and reconcile delivery routes end to end.
3. Add US4 for full customer/price administration.
4. Add US5 for cash closes and operational reporting.
5. Add US7 for user/settings administration and approved printer setup.
6. Add US6 only after exact hardware compatibility can be validated.
7. Complete the cross-cutting release gates after the desired story set is stable.

### Parallel Team Strategy

After Foundation and US1:

- One stream completes US2 sales and then US3 routes.
- A second stream begins US4 customer administration after the US2 persistence slice.
- A third stream begins US7 administration and later US5 reporting when sale data is
  stable.
- The team converges on US6 after its Sale Ticket/load/report/printer dependencies exist.

## Notes

- `[P]` means the task changes independent files and may begin only after its phase
  prerequisites are satisfied.
- Story labels map directly to the seven specification stories even though priority
  ordering places US7 before US6.
- API authorization, validation, financial calculations, inventory rules, and
  persistence remain authoritative regardless of frontend visibility.
- Never edit immutable history or applied migrations; corrections append movements,
  reversals, audit events, or new migrations.
- Complete and retain evidence for every test, migration, recovery, contract, hardware,
  and constitution gate before marking the feature done.

# Tasks: Warehouse Management Operations

**Input**: Design artifacts in `specs/001-warehouse-management/`  
**Tests**: Required by the project constitution; write tests first and observe failure.

## Phase 1: Setup

- [ ] T001 Scaffold npm workspaces and root scripts in package.json, tsconfig.base.json, and .npmrc
- [ ] T002 [P] Scaffold Express TypeScript application in apps/api/package.json and apps/api/src/server.ts
- [ ] T003 [P] Scaffold React/Vite TypeScript application in apps/web/package.json and apps/web/src/main.tsx
- [ ] T004 [P] Create shared packages in packages/domain/package.json, packages/contracts/package.json, and packages/config/package.json
- [ ] T005 [P] Configure linting, formatting, and TypeScript project references in eslint.config.js and tsconfig.json
- [ ] T006 Create PostgreSQL development service and example configuration in compose.yaml and .env.example
- [ ] T007 Configure CI quality gates in .github/workflows/ci.yml

## Phase 2: Foundational

**Checkpoint**: This phase blocks every user story.

- [ ] T008 Define the initial relational schema and constraints in apps/api/prisma/schema.prisma
- [ ] T009 Create and verify the baseline migration and seed data in apps/api/prisma/migrations/ and apps/api/prisma/seed.ts
- [ ] T010 [P] Implement validated environment configuration in apps/api/src/config/env.ts
- [ ] T011 [P] Implement decimal money, quantity, and rounding primitives with tests in packages/domain/src/money.ts and packages/domain/src/money.test.ts
- [ ] T012 [P] Implement structured errors, request IDs, sanitized logging, and error middleware in apps/api/src/http/error-handler.ts
- [ ] T013 Implement session authentication, password hashing, CSRF, and deactivation checks in apps/api/src/modules/auth/
- [ ] T014 Implement centralized role and resource-ownership authorization in apps/api/src/http/authorize.ts
- [ ] T015 [P] Add permitted/denied authentication integration tests in apps/api/tests/integration/auth.test.ts
- [ ] T016 Implement persisted idempotency execution wrapper in apps/api/src/shared/idempotency.ts
- [ ] T017 Implement append-only audit event writer in apps/api/src/shared/audit.ts
- [ ] T018 Generate and validate API types from specs/001-warehouse-management/contracts/openapi.yaml in packages/contracts/src/
- [ ] T019 [P] Implement the web API client, session provider, protected routes, and error UI in apps/web/src/services/api.ts and apps/web/src/app/

## Phase 3: User Story 1 — Control Inventory by Location (P1) 🎯 MVP

**Goal**: Administrators manage catalog and auditable, nonnegative stock by branch.  
**Independent Test**: Create a product, enter and transfer stock, adjust each branch, trigger a low-stock alert, and reconcile every balance to movement history.

- [ ] T020 [P] [US1] Add failing catalog, inventory overview, location-filter, and product-detail contract tests in apps/api/tests/contract/inventory.contract.test.ts
- [ ] T021 [P] [US1] Add failing concurrency, rollback, and movement integration tests in apps/api/tests/integration/inventory.test.ts
- [ ] T022 [P] [US1] Implement product, category, and location repositories in apps/api/src/modules/catalog/
- [ ] T023 [US1] Implement transactional balance locking and immutable movement service in apps/api/src/modules/inventory/inventory.service.ts
- [ ] T024 [US1] Implement entry, exit, adjustment, transfer, overview, product-detail, balance, movement, and alert endpoints in apps/api/src/modules/inventory/inventory.routes.ts
- [ ] T025 [P] [US1] Integrate catalog administration and the existing product detail baseline in apps/web/src/pages/InventoryProductDetailPage.tsx and apps/web/src/features/catalog/
- [ ] T026 [P] [US1] Replace temporary inventory data and integrate overview, location filter, balances, movements, transfers, adjustments, and alerts in apps/web/src/pages/InventoryPage.tsx, apps/web/src/data/inventory-products.ts, and apps/web/src/features/inventory/
- [ ] T027 [US1] Add menu navigation, location-filter, product-selection, product-detail, and inventory mutation acceptance flows in apps/web/tests/e2e/inventory.spec.ts

## Phase 4: User Story 2 — Record a Customer Sale (P1)

**Goal**: An assigned driver confirms an exactly-once sale using protected prices and route stock.  
**Independent Test**: Complete one sale with special pricing and verify sale, ticket, customer history, payment method, and one stock deduction; test retry and insufficient stock.

- [ ] T028 [P] [US2] Add failing sale contract and authorization tests in apps/api/tests/contract/sales.contract.test.ts
- [ ] T029 [P] [US2] Add failing atomicity, pricing, concurrency, and idempotency tests in apps/api/tests/integration/sales.test.ts
- [ ] T030 [US2] Implement effective-price resolution and immutable price snapshots in apps/api/src/modules/sales/pricing.service.ts
- [ ] T031 [US2] Implement transactional sale, lines, route deduction, movements, and ticket creation in apps/api/src/modules/sales/sale.service.ts
- [ ] T032 [US2] Implement sale confirmation and administrator cancellation endpoints in apps/api/src/modules/sales/sale.routes.ts
- [ ] T033 [US2] Implement driver sale builder, customer/product search, locked prices, payment method, and ticket result UI in apps/web/src/features/sales/
- [ ] T034 [US2] Add sale and cancellation acceptance flows in apps/web/tests/e2e/sales.spec.ts

## Phase 5: User Story 3 — Run and Reconcile a Delivery Route (P1)

**Goal**: Routes move stock from a branch through load, sale, return, reconciliation, and closure with zero remaining route inventory.  
**Independent Test**: Traverse all four states, verify permissions and quantities, approve a difference, close at zero, and reject invalid transitions/edits.

- [ ] T035 [P] [US3] Add failing route lifecycle contract tests in apps/api/tests/contract/routes.contract.test.ts
- [ ] T036 [P] [US3] Add failing load, return, difference, overlap, rollback, and transition tests in apps/api/tests/integration/routes.test.ts
- [ ] T037 [US3] Implement route assignment and active driver/vehicle uniqueness in apps/api/src/modules/routes/route.service.ts
- [ ] T038 [US3] Implement transactional load, start, return, reconciliation, adjustment, and close commands in apps/api/src/modules/routes/route-lifecycle.service.ts
- [ ] T039 [US3] Implement role/ownership-protected route endpoints in apps/api/src/modules/routes/route.routes.ts
- [ ] T040 [P] [US3] Implement administrator route creation and reconciliation UI in apps/web/src/features/routes/admin/
- [ ] T041 [P] [US3] Implement assigned-driver load, start, return, and route-stock UI in apps/web/src/features/routes/driver/
- [ ] T042 [US3] Add complete route acceptance flow in apps/web/tests/e2e/routes.spec.ts

## Phase 6: User Story 4 — Manage Customers and Pricing (P2)

**Goal**: Administrators manage individual customers and time-bounded product pricing; drivers receive restricted search data.  
**Independent Test**: Create/edit/archive a customer, assign/replace a special price, verify fallback price/history, and deny driver mutations.

- [ ] T043 [P] [US4] Add failing customer/pricing contract and authorization tests in apps/api/tests/contract/customers.contract.test.ts
- [ ] T044 [US4] Implement customer archival, history, price validity, and overlap rules in apps/api/src/modules/customers/customer.service.ts
- [ ] T045 [US4] Implement role-filtered customer and price endpoints in apps/api/src/modules/customers/customer.routes.ts
- [ ] T046 [US4] Implement customer, price, and history administration UI in apps/web/src/features/customers/
- [ ] T047 [US4] Add customer pricing acceptance flow in apps/web/tests/e2e/customers.spec.ts

## Phase 7: User Story 5 — Close Cash and Review Operations (P2)

**Goal**: Administrators save reproducible cash closes and view timezone-correct operational reports.  
**Independent Test**: Seed known sales across categories, dates, and drivers and exactly reconcile grouped/gross/partner/remaining values for day, week, and month.

- [ ] T048 [P] [US5] Add failing rounding and cash-close unit tests in apps/api/src/modules/cash-closes/cash-close.test.ts
- [ ] T049 [P] [US5] Add failing timezone and reproducibility integration tests in apps/api/tests/integration/reports.test.ts
- [ ] T050 [US5] Implement preserved contributing-sale cash closes in apps/api/src/modules/cash-closes/cash-close.service.ts
- [ ] T051 [US5] Implement driver, product, inventory, and financial report queries in apps/api/src/modules/reports/report.service.ts
- [ ] T052 [US5] Implement cash-close/report endpoints and OpenAPI schemas in apps/api/src/modules/reports/report.routes.ts and specs/001-warehouse-management/contracts/openapi.yaml
- [ ] T053 [US5] Implement period filters, exact totals, and report UI in apps/web/src/features/reports/
- [ ] T054 [US5] Add cash-close and report acceptance flow in apps/web/tests/e2e/reports.spec.ts

## Phase 8: User Story 7 — Administer Users and Settings (P2)

**Goal**: Administrators manage accounts/roles/settings while drivers access only their printer selection and test.  
**Independent Test**: Create a driver, verify restrictions, configure/test its printer, deactivate it, and retain historical attribution.

- [ ] T055 [P] [US7] Add failing user/settings authorization tests in apps/api/tests/integration/administration.test.ts
- [ ] T056 [US7] Implement user lifecycle, role assignment, session revocation, vehicle, and business settings services in apps/api/src/modules/administration/
- [ ] T057 [US7] Implement admin and driver-scoped settings endpoints in apps/api/src/modules/administration/administration.routes.ts
- [ ] T058 [P] [US7] Implement user, vehicle, and business settings UI in apps/web/src/features/administration/
- [ ] T059 [P] [US7] Implement driver printer selection/test UI in apps/web/src/features/printers/
- [ ] T060 [US7] Add user deactivation and role overview acceptance flow in apps/web/tests/e2e/administration.spec.ts

## Phase 9: User Story 6 — Save, Share, and Print Documents (P3)

**Goal**: Generate portable documents and retryable thermal output without altering source transactions.  
**Independent Test**: Generate each supported output from known records, simulate hardware failure, retry, and prove source records were neither lost nor duplicated.

- [ ] T061 [P] [US6] Add failing snapshot, failure, and output-idempotency tests in apps/api/tests/integration/documents.test.ts
- [ ] T062 [US6] Implement snapshot-based ticket, load, cash-close, and report renderers in apps/api/src/modules/documents/renderers/
- [ ] T063 [US6] Implement document attempt state and retry endpoints in apps/api/src/modules/documents/document.service.ts
- [ ] T064 [P] [US6] Implement capability-detected Web Bluetooth ESC/POS adapter in apps/web/src/features/printers/bluetooth-adapter.ts
- [ ] T065 [US6] Implement download, share, OS-print fallback, error, and retry UI in apps/web/src/features/documents/
- [ ] T066 [US6] Add output failure/retry acceptance flow and hardware test checklist in apps/web/tests/e2e/documents.spec.ts and docs/printer-acceptance.md

## Phase 10: Polish and Cross-Cutting Gates

- [ ] T067 [P] Add indexes and verify search/report timing goals in apps/api/prisma/schema.prisma and apps/api/tests/performance/search.test.ts
- [ ] T068 [P] Add accessibility, responsive mobile viewport, loading, empty, and conflict states in apps/web/src/components/
- [ ] T069 Add security headers, rate limits, cookie policy, secret scanning, and dependency audit in apps/api/src/http/security.ts and .github/workflows/ci.yml
- [ ] T070 Document migration recovery, deployment, observability, and operator backup procedures in docs/operations.md
- [ ] T071 Run every scenario in specs/001-warehouse-management/quickstart.md and record release evidence in specs/001-warehouse-management/checklists/release.md
- [ ] T072 Revalidate OpenAPI compatibility, constitution compliance, clean migrations, all tests, and both production builds in .github/workflows/ci.yml

## Dependencies and Execution Order

- Setup → Foundation → all user stories → Polish.
- US1 supplies inventory; US3 depends on US1; US2 depends on route inventory from US3 and customer lookup from the foundation/minimal seed.
- US4 completes customer administration and pricing after the sale slice proves the core lookup.
- US5 depends on confirmed sales; US6 depends on persisted sales/routes/cash closes/reports.
- US7 can begin after Foundation and should complete before multi-user acceptance.
- Recommended functional order: **US1 → US3 → US2 → US4/US7 → US5 → US6**.

## Parallel Opportunities

- T002–T005, T010–T012/T015, and story test tasks marked `[P]` can proceed independently.
- After Foundation, US7 can run alongside the P1 chain; frontend work marked `[P]` can begin once its contract is fixed.
- Within US3, administrator and driver views are parallel; within US7, administration and printer views are parallel.

## Implementation Strategy

The first demonstrable MVP is Setup + Foundation + US1. The first operational sales release additionally requires US3 then US2. Keep each checkpoint deployable, run its independent test before moving on, and commit by task or tightly related task group.

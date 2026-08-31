# Implementation Plan: Warehouse Management Operations

**Branch**: `001-warehouse-management` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-warehouse-management/spec.md`

## Summary

Build a responsive warehouse and route-sales web application with an independently
buildable React/Vite frontend and Node.js/Express API. The API owns authentication,
role authorization, validation, exact monetary calculations, route state transitions,
inventory locking, idempotency, audit history, and persistence. A relational database
stores current balances plus immutable movements and historical transaction snapshots;
an OpenAPI contract binds the frontend and API. Portable documents are derived from
committed records; Bluetooth output is limited to sale tickets, confirmed route loads,
and cash closes and is a retryable browser-side operation that cannot change the
underlying business transaction. Reports remain portable-only. Administrators may
access all document types; Drivers may access only their own Sale Tickets and confirmed
route loads for routes assigned to them, including source-scoped document and
output-attempt history. Reporting uses Monday-based local calendar periods with
start-inclusive/end-exclusive boundaries. Each exact period has one current cash
close; corrections append an immutable linked successor and never rewrite the prior
financial snapshot.

## Technical Context

**Language/Version**: TypeScript 6 in strict mode across frontend and backend; Node.js
24 LTS for the API and build tooling

**Primary Dependencies**: React 19.2, Vite 8, Express 5, Zod 4, Kysely 0.29 with `pg`,
`decimal.js`, `@js-temporal/polyfill`, `express-session`, Argon2id, TanStack Query 5, React Hook Form, MUI Core,
`i18next`, `react-i18next`,
PDFKit, and an application-owned Web Bluetooth printer adapter; exact compatible patch
versions MUST be pinned in the implementation lockfile

**Storage**: PostgreSQL 18.x through Kysely/`pg`; exact `numeric` money and quantities,
row-level concurrency control, database constraints, append-only ledgers, and
version-controlled migrations

**Testing**: Vitest, React Testing Library, Supertest, Testcontainers with PostgreSQL
18, OpenAPI lint/request-response validation, and Playwright across Chromium, Firefox,
and WebKit; direct-database constraint and transactional audit rollback tests; a seeded
25-user performance profile with browser-level timing from search action until loading
ends, matching rows or an explicit no-results state is visible, identifying/relevant
values are rendered, and available actions are enabled; versioned usability fixtures
and documented evidence for five Administrators and five Drivers; exact local-calendar
boundary and concurrent cash-close/supersession tests; source-scoped document-list and
output-attempt-history contract, integration, and E2E deny-path tests; physical printer
acceptance on the approved Chromium/device/hardware pair

**Target Platform**: Linux-hosted Node.js API and static web assets; current Chromium-
based browsers in a secure context for Bluetooth printer access; responsive layouts
for desktop, tablet, and driver phone-sized browser viewports

**Project Type**: TypeScript web application in a workspace monorepo with separate
frontend, backend, shared contract, database migration, and end-to-end test packages

**Performance Goals**: Meet SC-003, SC-006, SC-007, and SC-009: all five Driver
acceptance participants complete an exactly ten-line sale and obtain its sale ticket
without assistance in under two minutes; at least nine of ten participants complete
their assigned workflow on the first attempt, with each Administrator reconciling and
closing a Returned route containing one documented difference. A first attempt is one
uninterrupted run: pre-submission corrections are allowed, while a rejected final
submission, restart, or assistance fails. Under 25 concurrent users with 10,000
products, 10,000 customers, and 100,000 completed sales, at least 95% of routine
searches meet SC-006's complete visible-result condition within two seconds and at
least 95% of portable documents are ready within ten seconds

**Constraints**: No native or offline-first client; API-only database access; API-side
role enforcement and validation; exact money; no negative inventory; atomic movements
and business records; idempotent retries; immutable history; closed-route locking;
database-enforced non-overlapping active customer-price periods; same-transaction audit
events for every security-sensitive or business-critical mutation; Drivers may read
only their own sales and routes assigned to them; output failure must not roll back or
duplicate committed transactions; route-load output requires a confirmed immutable
load; Administrators may access all document types, while Drivers may generate,
download, share, print, or reprint only Sale Tickets for their own sales and confirmed
route loads for assigned routes; Driver cash-close/report and unrelated-document access
is denied; the same source predicates govern document lists and OutputAttempt history;
reports may be generated, downloaded, and shared but never thermally printed;
reporting periods use configured-timezone local midnight, Monday-based weeks, calendar
months, and `[start,end)` boundaries; only one CashClose is current per exact period,
with idempotent reuse, conflicting independent duplicates, and immutable linked
superseding corrections

The browser bundles English and Spanish translation resources. Language changes are
reactive and do not reload the page; a validated `en`/`es` preference is stored in
browser storage with Spanish as the first-visit default. Locale-aware presentation is
kept separate from exact API and persisted business values. Stable API problem codes
select translated user messages, with a generic localized fallback for unknown codes.

**Scale/Scope**: One organization and business timezone, initially two branches,
multiple simultaneous routes, 25 concurrent staff users, 10,000 products, 10,000
customers, and 100,000 completed sales in the acceptance dataset; production sizing
must be verified with the reproducible SC-006/SC-007 workload

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

| Constitutional requirement | Planned evidence | Status |
|---|---|---|
| React/Vite frontend and Node.js/Express backend are separate and independently buildable/testable | `apps/web`, `apps/api`, workspace scripts, isolated test suites | PASS |
| Browser communicates only through documented HTTP contracts and never accesses the database | Versioned OpenAPI contract and API client; database code exists only in `apps/api` | PASS |
| API is authoritative for authentication, authorization, validation, domain rules, and persistence | API middleware plus application/domain services; SQL-scoped Driver sale/route/document projections; documented document/output-attempt list, direct-ID, and content deny-path tests | PASS |
| Inventory and coordinated business workflows are atomic and retry-safe | Database transactions, row locks/constraints, immutable movements, persisted idempotency keys, and a GiST exclusion constraint preventing overlapping active customer-price periods | PASS |
| Money is exact and deterministic | Database exact decimals or integer minor units; shared API schemas; centralized calculation and rounding tests | PASS |
| Critical changes and corrections preserve reproducible history | A complete mutation-to-audit coverage matrix, same-transaction audit assertions, append-only movements/audit events, snapshots, archival flags, reversals, and immutable linked CashClose supersession | PASS |
| Contracts are documented, compatible, and expose explicit errors | OpenAPI schemas, generated frontend types, standardized error responses, contract-diff review, and a validated portable/thermal-output capability matrix | PASS |
| Required unit, integration, authorization, contract, E2E, rollback, retry, performance, and usability tests gate completion | Layered suites, local-calendar/DST and concurrent CashClose-currentness tests, source-scoped history tests, SC-006's exact visible-result completion condition, exact first-attempt usability scoring, and CI/review commands documented in quickstart | PASS |
| Schema evolution and operations use migrations, recovery plans, validated config, and safe logging | Versioned migrations, migration runbook, startup schema validation, structured redacted logs | PASS |

No constitutional violations or exceptions are proposed. Phase 0 may proceed.

### Post-Design Re-check

| Constitutional requirement | Phase 1 evidence | Status |
|---|---|---|
| Separate web/API builds and trusted backend boundary | Source tree decision plus API-owned domain/transaction model in [data-model.md](./data-model.md) | PASS |
| Documented HTTP-only frontend/backend communication | 3.1.2 design contract and compatibility rules in [contracts/](./contracts/) | PASS |
| API authorization, validation, and safe errors | Session/CSRF/RBAC design, role-scoped Driver sale/route/document/attempt projections, and RFC 9457 schemas for list/direct-ID/content deny paths | PASS |
| Atomic, nonnegative, traceable, idempotent inventory and constrained price periods | Balance checks, deterministic locks, Serializable transaction boundaries, movements, IdempotencyRequest, and a partial GiST exclusion constraint on active CustomerPrice ranges | PASS |
| Exact deterministic finance and preserved inputs | Numeric/decimal-string types, line rounding, stored price/category/rate snapshots | PASS |
| Auditability and archival | Mutation coverage matrix, transactional AuditEvent assertions for every security-sensitive/business-critical write, append-only InventoryMovement, restrictive FKs, archive flags, compensating records, and CashClose supersession chains | PASS |
| Contract compatibility and output isolation | `/api/v1`, generated-type/diff gates, documented source-scoped document/output-attempt list and detail operations, committed-source DocumentOutput and OutputAttempt, confirmed route-load output, explicit role/source authorization, and report print/reprint rejection | PASS |
| Automated quality and review gates | Layered commands, Monday/local-midnight and cash-close supersession acceptance, source-scoped history denial tests, exact SC-006 visible-result performance fixture, exact human usability workflows/first-attempt scoring, and scenarios in [quickstart.md](./quickstart.md) | PASS |
| Migration and operational reliability | Immutable migrations, expand/backfill/verify/contract, PITR/restore evidence, startup validation, redacted logs | PASS |

Post-design gate passes with no exceptions. The only material delivery risk is hardware
compatibility: FR-033/FR-047 require an approved BLE/GATT printer and Chromium/device
acceptance matrix. An incompatible Bluetooth Classic-only printer, mandatory iOS/Safari
direct printing, or unattended printing would require a documented plan/spec amendment.

## Project Structure

### Documentation (this feature)

```text
specs/001-warehouse-management/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── README.md
└── tasks.md              # Created later by $speckit-tasks
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── src/
│   │   ├── config/
│   │   ├── http/
│   │   ├── auth/
│   │   ├── modules/
│   │   └── shared/
│   └── tests/
└── web/
    ├── src/
    │   ├── app/
    │   ├── features/
    │   ├── components/
    │   └── lib/
    └── tests/
packages/
├── contracts/            # OpenAPI source, generated types, validators
└── config/               # Shared lint and TypeScript configuration
database/
├── migrations/
└── seeds/
tests/
└── e2e/
```

**Structure Decision**: Use a workspace monorepo because the frontend, API, generated
contract package, migrations, and E2E suite must evolve together while remaining
independently buildable and testable. Domain code stays inside the API; the shared
package contains transport contracts and tooling configuration only, never trusted
business logic.

## Complexity Tracking

No constitutional violations require justification.

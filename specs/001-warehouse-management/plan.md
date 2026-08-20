# Implementation Plan: Warehouse Management Operations

**Branch**: `001-warehouse-management` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-warehouse-management/spec.md`

## Summary

Build a responsive warehouse and route-sales web application with an independently
buildable React/Vite frontend and Node.js/Express API. The API owns authentication,
role authorization, validation, exact monetary calculations, route state transitions,
inventory locking, idempotency, audit history, and persistence. A relational database
stores current balances plus immutable movements and historical transaction snapshots;
an OpenAPI contract binds the frontend and API. Portable documents are derived from
committed records, while Bluetooth output is a retryable browser-side operation that
cannot change the underlying business transaction.

## Technical Context

**Language/Version**: TypeScript 6 in strict mode across frontend and backend; Node.js
24 LTS for the API and build tooling

**Primary Dependencies**: React 19.2, Vite 8, Express 5, Zod 4, Kysely 0.29 with `pg`,
`decimal.js`, `express-session`, Argon2id, TanStack Query 5, React Hook Form, MUI Core,
PDFKit, and an application-owned Web Bluetooth printer adapter; exact compatible patch
versions MUST be pinned in the implementation lockfile

**Storage**: PostgreSQL 18.x through Kysely/`pg`; exact `numeric` money and quantities,
row-level concurrency control, database constraints, append-only ledgers, and
version-controlled migrations

**Testing**: Vitest, React Testing Library, Supertest, Testcontainers with PostgreSQL
18, OpenAPI lint/request-response validation, and Playwright across Chromium, Firefox,
and WebKit; direct-database constraint and transactional audit rollback tests; a seeded
25-user performance profile; documented usability evidence for five Administrators
and five Drivers; physical printer acceptance on the approved Chromium/device/hardware
pair

**Target Platform**: Linux-hosted Node.js API and static web assets; current Chromium-
based browsers in a secure context for Bluetooth printer access; responsive layouts
for desktop, tablet, and driver phone-sized browser viewports

**Project Type**: TypeScript web application in a workspace monorepo with separate
frontend, backend, shared contract, database migration, and end-to-end test packages

**Performance Goals**: Meet SC-003, SC-006, and SC-007: all five Driver acceptance
participants complete a typical ten-line sale and obtain its sale ticket without
assistance in under two minutes; under 25 concurrent users with 10,000 products,
10,000 customers, and 100,000 completed sales, at least 95% of routine searches return
usable results within two seconds and at least 95% of portable documents are ready
within ten seconds

**Constraints**: No native or offline-first client; API-only database access; API-side
role enforcement and validation; exact money; no negative inventory; atomic movements
and business records; idempotent retries; immutable history; closed-route locking;
database-enforced non-overlapping active customer-price periods; same-transaction audit
events for every security-sensitive or business-critical mutation; Drivers may read
only their own sales and routes assigned to them; output failure must not roll back or
duplicate committed transactions

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
| API is authoritative for authentication, authorization, validation, domain rules, and persistence | API middleware plus application/domain services; SQL-scoped Driver sale/route-history projections; list and direct-ID deny-path tests | PASS |
| Inventory and coordinated business workflows are atomic and retry-safe | Database transactions, row locks/constraints, immutable movements, persisted idempotency keys, and a GiST exclusion constraint preventing overlapping active customer-price periods | PASS |
| Money is exact and deterministic | Database exact decimals or integer minor units; shared API schemas; centralized calculation and rounding tests | PASS |
| Critical changes and corrections preserve reproducible history | A complete mutation-to-audit coverage matrix, same-transaction audit assertions, append-only movements/audit events, snapshots, archival flags, and reversals | PASS |
| Contracts are documented, compatible, and expose explicit errors | OpenAPI schemas, generated frontend types, standardized error responses, contract-diff review | PASS |
| Required unit, integration, authorization, contract, E2E, rollback, retry, performance, and usability tests gate completion | Layered suites, the exact seeded load profile, human usability protocol, and CI/review commands documented in quickstart | PASS |
| Schema evolution and operations use migrations, recovery plans, validated config, and safe logging | Versioned migrations, migration runbook, startup schema validation, structured redacted logs | PASS |

No constitutional violations or exceptions are proposed. Phase 0 may proceed.

### Post-Design Re-check

| Constitutional requirement | Phase 1 evidence | Status |
|---|---|---|
| Separate web/API builds and trusted backend boundary | Source tree decision plus API-owned domain/transaction model in [data-model.md](./data-model.md) | PASS |
| Documented HTTP-only frontend/backend communication | 3.1.2 design contract and compatibility rules in [contracts/](./contracts/) | PASS |
| API authorization, validation, and safe errors | Session/CSRF/RBAC design, role-scoped Driver history projections, and RFC 9457 schemas/list/direct-ID deny-path tests | PASS |
| Atomic, nonnegative, traceable, idempotent inventory and constrained price periods | Balance checks, deterministic locks, Serializable transaction boundaries, movements, IdempotencyRequest, and a partial GiST exclusion constraint on active CustomerPrice ranges | PASS |
| Exact deterministic finance and preserved inputs | Numeric/decimal-string types, line rounding, stored price/category/rate snapshots | PASS |
| Auditability and archival | Mutation coverage matrix, transactional AuditEvent assertions for every security-sensitive/business-critical write, append-only InventoryMovement, restrictive FKs, archive flags, and compensating records | PASS |
| Contract compatibility and output isolation | `/api/v1`, generated-type/diff gates, committed-source DocumentOutput and OutputAttempt | PASS |
| Automated quality and review gates | Layered commands, exact performance fixture, human usability protocol, and acceptance scenarios in [quickstart.md](./quickstart.md) | PASS |
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

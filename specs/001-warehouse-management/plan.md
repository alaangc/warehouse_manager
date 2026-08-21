# Implementation Plan: Warehouse Management Operations

**Branch**: `agent/login-screen` | **Date**: 2026-08-20 | **Spec**: [spec.md](spec.md)

## Summary

Build a responsive browser application with a React/Vite frontend and an authoritative Node.js/Express API. The inventory slice includes a primary overview, location filter, low-stock selection, and product-specific detail view. PostgreSQL transactions, row locking, immutable inventory movements, monetary snapshots, idempotency keys, and audit events protect inventory, sales, routes, and cash closing. Documents derive from committed records; printing never controls transaction success.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 24 LTS, React 19.2  
**Primary Dependencies**: Express 5, React Router, TanStack Query, Zod, Prisma, decimal.js, PDFKit, Vitest, Playwright  
**Storage**: PostgreSQL 17+ with version-controlled Prisma migrations  
**Testing**: Vitest; Supertest and Testcontainers PostgreSQL; Playwright  
**Target Platform**: Linux server and modern browsers; HTTPS for production and Web Bluetooth  
**Project Type**: npm-workspaces web application (`apps/api`, `apps/web`, shared packages)  
**Performance Goals**: 95% of searches within 2 seconds; documents within 10 seconds; a typical 10-line sale within 2 minutes  
**Constraints**: no negative inventory; exact decimal money; online-only; API RBAC; immutable history; one configured timezone; variable Bluetooth support  
**Scale/Scope**: one organization, initially Magdalena and Tucson, tens of users, concurrent routes, 7 stories and 54 requirements

## Constitution Check

*GATE: Passed before research and passed again after design.*

| Principle | Design evidence | Status |
|---|---|---|
| Web separation | `apps/web` uses documented `/api/v1`; API owns domain services | PASS |
| API authority/security | Server session, centralized RBAC, boundary validation, environment secrets | PASS |
| Transactional operations | DB transactions and locks; movements commit with mutations | PASS |
| Exact financial arithmetic | PostgreSQL `numeric`, decimal HTTP strings, `decimal.js`, centralized rounding | PASS |
| Audit/history | Append-only movements/events, snapshots, archival and reversals | PASS |
| Contracts | OpenAPI contract, generated types, stable error envelope | PASS |
| Testing | Unit, DB integration, authorization, contract and E2E gates | PASS |
| Database reliability | Migrations, recovery checks, startup validation, structured logs | PASS |

No exception is required. Printing is downstream of committed transactions; money and inventory invariants exist in services and database constraints.

## Project Structure

```text
specs/001-warehouse-management/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/openapi.yaml
└── tasks.md                 # created by speckit-tasks

apps/
├── api/
│   ├── prisma/{schema.prisma,migrations/}
│   ├── src/{config,http,modules,shared}/
│   └── tests/{unit,integration,contract}/
└── web/
    ├── src/{app,features,components,services}/
    └── tests/{unit,e2e}/
packages/
├── contracts/
├── domain/
└── config/
```

**Structure Decision**: npm workspaces keep frontend and backend independently buildable while synchronizing contracts and pure primitives. Persistence, authorization, and business decisions remain API-owned.

## Delivery Sequence

1. Workspace, CI, environment validation, database, authentication, RBAC and audit primitives.
2. P1 catalog, balances, movements, transfers, adjustments, locking and alerts.
3. P1 routes, loads, pricing, idempotent sales, tickets, returns and reconciliation.
4. P2 customers, users, vehicles, settings, cash closing and reports.
5. P3 documents, Bluetooth adapter, retry UX and hardware validation.

## Current Inventory UI Baseline

- `apps/web/src/pages/InventoryPage.tsx` implements the responsive inventory overview,
  primary-menu entry, summary metrics, location filter, and selectable low-stock rows.
- `apps/web/src/pages/InventoryProductDetailPage.tsx` implements product-specific detail
  routing and the catalog, stock, location, and movement presentation.
- `apps/web/src/data/inventory-products.ts` is temporary presentation data. It MUST be
  replaced by the documented API client during US1 implementation; authorization,
  inventory rules, persistence, mutations, and authoritative calculations MUST remain
  behind the Express API.
- The baseline is not considered a completed US1 because API contracts, transactional
  persistence, automated tests, and mutation flows remain pending.

## Complexity Tracking

No constitution violations require justification.

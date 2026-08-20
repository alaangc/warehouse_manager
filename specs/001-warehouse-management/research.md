# Phase 0 Research: Warehouse Management Operations

**Date**: 2026-08-20
**Feature**: [Warehouse Management Operations](./spec.md)

This research resolves every technical unknown identified in the implementation plan.
Versions are planning baselines, not floating dependencies: implementation MUST pin
compatible versions in the lockfile and review upgrades through tests and contract
diffs.

## Runtime, Language, and Workspace

**Decision**: Use Node.js 24 LTS, TypeScript 6 in strict mode, ECMAScript modules, and
a pnpm workspace containing independently buildable `apps/api` and `apps/web`
applications plus shared contract/configuration packages.

**Rationale**: Node recommends LTS releases for production; Node 24 is LTS on the plan
date while Node 26 is still Current. TypeScript 6 is the stable typed-language baseline.
One workspace keeps contract generation and cross-application verification atomic
without merging the frontend and backend runtime boundaries.

**Alternatives considered**:

- Node 26: rejected until it reaches LTS and all dependencies are verified.
- Separate repositories: rejected because coordinated API contract changes would be
  harder to validate and release for this single product.
- Plain JavaScript: rejected because strict compile-time checks reduce transport,
  monetary-string, and state-transition mistakes.

**Sources**: [Node release status](https://nodejs.org/en/about/previous-releases),
[TypeScript 6.0 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)

## API Framework, Validation, and Contracts

**Decision**: Use Express 5 with thin HTTP controllers, Zod 4 for strict input,
configuration, and output schemas, and OpenAPI 3.1.2 generated deterministically from
the transport schemas. Check in the generated contract, lint it with Redocly's strict
rules, generate frontend types with `openapi-typescript`, and run request/response
contract validation in integration tests.

**Rationale**: Express is constitutionally required. Reusing one executable schema for
runtime boundary validation and OpenAPI generation reduces contract drift. OpenAPI
3.1.2 is supported across the selected generation and validation toolchain. A small
application-owned `fetch` adapter will attach credentials, CSRF and idempotency headers,
decode Problem Details, and enforce cancellation/timeouts.

**Alternatives considered**:

- OpenAPI 3.2: deferred because the complete validator/generator toolchain does not yet
  support it consistently.
- Hand-maintained request types separate from validation: rejected because they drift.
- A generated runtime fetch client: rejected as a foundational dependency; generated
  static types plus a small owned adapter provide clearer error and credential control.

**Sources**: [Express support](https://expressjs.com/en/support/),
[Zod JSON Schema](https://zod.dev/json-schema),
[OpenAPI 3.1.2](https://spec.openapis.org/oas/v3.1.2.html),
[zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi),
[openapi-typescript](https://openapi-ts.dev/introduction)

## HTTP Errors and Compatibility

**Decision**: Return `application/problem+json` responses following RFC 9457 with a
stable application error code, HTTP status, safe detail, request/instance identifier,
and field errors when applicable. Use `/api/v1`; additions remain backward-compatible,
while breaking changes require a new API version or an explicit coordinated migration.

**Rationale**: The frontend must distinguish authentication, authorization, validation,
conflict, throttling, and server failures without receiving stack traces or database
details. Versioning and contract-diff checks make compatibility review enforceable.

**Alternatives considered**:

- Ad hoc JSON error shapes: rejected because client handling and tests would diverge.
- Exposing internal exception messages: rejected as a security and compatibility risk.

**Source**: [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)

## Authentication, Authorization, and CSRF

**Decision**: Serve the SPA and `/api` on one HTTPS origin. Use Argon2id password
hashes and opaque server-side sessions stored in PostgreSQL. The browser receives only
a `__Host-` session cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, and `Path=/`.
Regenerate sessions after login or privilege changes; revoke them at logout and user
deactivation. Require a per-session synchronizer CSRF token in a custom header on every
unsafe request and verify same-origin request metadata. Express middleware authenticates
the request, while every application operation performs explicit role/resource checks.

**Rationale**: Server sessions support immediate user deactivation and avoid exposing
bearer credentials to browser storage. Same-origin cookies simplify deployment;
server-side CSRF state and origin checks protect cookie-authenticated mutations.

Driver history authorization is enforced in repository/service queries as well as HTTP
policies: Driver sale history is constrained to `sale.driver_id = authenticated user`,
and Driver route history is constrained to `route.driver_id = authenticated user` in
every list and direct-detail lookup. Client-supplied Driver or route filters never
broaden scope. Administrators retain system-wide access. Contract, integration, and
end-to-end tests cover both allowed history and attempts to access another Driver's
records.

**Alternatives considered**:

- JWTs in local or session storage: rejected because theft and revocation handling add
  risk without a cross-service requirement.
- Cookie `SameSite` alone: rejected because it is defense in depth, not the only CSRF
  control.
- Frontend route guards alone: rejected because the API must remain authoritative.

**Sources**: [express-session](https://expressjs.com/en/resources/middleware/session/),
[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Database and Typed Access

**Decision**: Use PostgreSQL 18.x (develop/test on the current 18 minor and deploy the
latest supported minor), Kysely 0.29.x over `pg`, parameterized queries, one configured
pool, and version-controlled Kysely migrations with reviewed PostgreSQL-specific SQL
where needed.

**Rationale**: PostgreSQL supplies exact numerics, constraints, transactions, row locks,
partial unique indexes, and mature recovery. Kysely preserves TypeScript query typing
while exposing the SQL features needed for conditional inventory updates, lock ordering,
append-only ledgers, and partial indexes.

**Alternatives considered**:

- PostgreSQL 17: acceptable hosting fallback but not the primary new-project baseline.
- Prisma: rejected for this domain because central workflows rely heavily on partial
  indexes, explicit locking, custom checks, and migration SQL that would bypass much of
  Prisma's abstraction.
- Direct `pg`: rejected because it adds schema typing and transaction boilerplate
  without adding required control beyond Kysely.

**Sources**: [PostgreSQL version policy](https://www.postgresql.org/support/versioning/),
[Kysely introduction](https://www.kysely.dev/docs/getting-started),
[node-postgres transactions](https://node-postgres.com/features/transactions)

## Temporal Customer-Price Exclusion

**Decision**: Model each active customer-specific price with a half-open UTC validity
range `[valid_from, valid_to)`, where a null upper bound is unbounded. Require
`valid_to > valid_from` when present. Provision PostgreSQL's trusted `btree_gist`
extension through the migration owner and create a partial GiST exclusion constraint
combining equality on `customer_id` and `product_id` with range overlap (`&&`) on the
validity range, applying only while the row is active.

**Rationale**: An ordinary unique index cannot prevent two different time ranges from
overlapping. The exclusion constraint makes the invariant authoritative under direct
SQL and concurrent writers, as required by the constitution. Adjacent half-open ranges
remain valid. Integration tests must bypass the application service and prove overlap
rejection, adjacent-range acceptance, unbounded-range handling, inactive-row behavior,
and concurrent conflict handling.

**Alternatives considered**:

- Application-only overlap checks: rejected because concurrent requests can both pass
  before either commits.
- A unique constraint on start/end timestamps: rejected because distinct endpoints can
  still describe overlapping periods.
- An inclusive upper boundary: rejected because adjacent prices would conflict at the
  shared transition instant.

**Sources**: [PostgreSQL range constraints](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT),
[exclusion constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION),
[`btree_gist`](https://www.postgresql.org/docs/current/btree-gist.html)

## Inventory Concurrency and Transaction Isolation

**Decision**: Keep one balance row per product and stock location with a nonnegative
database check. Single decrements use atomic conditional `UPDATE ... WHERE quantity >=
requested RETURNING`. Multi-balance operations lock affected rows with `FOR UPDATE` in
stable location/product order. Inventory changes, business records, movements,
idempotency state, and audit events commit in the same Serializable transaction. Retry
the complete transaction up to three times on serialization failures or deadlocks with
bounded exponential backoff and jitter; report persistent conflicts observably.

**Rationale**: Conditional updates prevent negative stock. Deterministic row locking
and Serializable isolation protect multi-row invariants under concurrent routes and
sales. PostgreSQL requires complete transaction retries when Serializable execution
detects an unsafe ordering.

**Alternatives considered**:

- Application-only prechecks: rejected because concurrent requests can both pass.
- Read Committed for inventory mutations: rejected because multi-row invariants would
  require more bespoke anomaly handling.
- Unbounded automatic retries: rejected because they hide contention and can amplify
  overload.

**Sources**: [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html),
[transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html),
[serialization failures](https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html)

## Idempotency

**Decision**: Require `Idempotency-Key` on critical business mutations. Persist actor,
operation, key, canonical request hash, state, resulting resource/response, and
timestamps under a unique `(actor, operation, key)` constraint. The key record and
business operation commit together. An identical replay returns the original outcome;
a reused key with a different request returns `409 Conflict`. Critical business records
also carry a unique client operation UUID.

**Rationale**: A client may lose the response after a successful commit. Persisted
deduplication makes the retry safe even across API restarts and concurrent delivery.

**Alternatives considered**:

- In-memory duplicate suppression: rejected because it is lost on restart and is not
  shared across processes.
- Blind retries: rejected because they can duplicate sales, movements, and returns.

**Source**: [PostgreSQL `INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html)

## Transactional Audit Coverage

**Decision**: Use one typed application-owned AuditWriter inside the same database
transaction as every security-sensitive or business-critical mutation. The mutation
cannot commit if its AuditEvent insert fails. Action codes and before/after snapshot
fields use explicit allowlists; password hashes, credentials, session/CSRF tokens, and
browser device handles are always excluded. Append-only database permissions prevent
the runtime role from updating or deleting audit rows.

Coverage includes user/access changes; catalog, customer, customer-price, vehicle,
business-setting, printer-profile, and printer-preference changes; inventory operations
and reversals; route creation, assignment, loading, transitions, reconciliation,
differences, closure, and correction; sale confirmation/cancellation; cash-close and
persisted report-snapshot creation. InventoryMovement and OutputAttempt remain
specialized immutable ledgers but do not replace the AuditEvent for their source
business or configuration mutation.

**Rationale**: Best-effort or asynchronous audit insertion can leave an authoritative
business change with no corresponding history. Transaction participation also lets
integration tests prove audit rollback when a mutation fails and mutation rollback
when audit insertion fails. Operational logs remain separate diagnostic evidence.

**Alternatives considered**:

- Asynchronous or best-effort audit writes: rejected because delivery failure creates
  permanent gaps.
- Operational logs as the audit ledger: rejected because their retention, access, and
  mutability guarantees differ.
- Database triggers for every domain action: rejected as the primary mechanism because
  they lack the application command context needed for stable actions, reasons, and
  safe snapshots; database permissions still enforce append-only storage.

**Sources**: [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html),
[privileges](https://www.postgresql.org/docs/current/ddl-priv.html)

## Exact Money and Quantities

**Decision**: Store unit prices and configurable monetary inputs as PostgreSQL
`numeric(19,4)`, finalized line amounts/totals/shares as `numeric(19,2)`, and inventory
quantities as `numeric(18,3)`. Money and quantities cross JSON and `pg` boundaries as
canonical decimal strings. Use a configured `decimal.js` clone. Round sale-line amounts
half away from zero to two decimals, sum stored rounded lines for totals, then apply and
round the partner percentage once. Persist every applied price, category/reporting
snapshot, rate, basis, line amount, and rounded result.

**Rationale**: PostgreSQL `numeric` and decimal arithmetic are exact; JavaScript binary
floating point and PostgreSQL `real`/`double precision` are not. Aligning domain and
database rounding prevents historical recalculation drift.

**Alternatives considered**:

- Integer cents only: workable for final amounts but awkward for unit prices multiplied
  by fractional quantities and intermediate precision.
- JavaScript `number`: constitutionally prohibited for authoritative money.
- PostgreSQL `money`: rejected because scale/formatting depend on locale.

**Sources**: [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html),
[PostgreSQL money type](https://www.postgresql.org/docs/current/datatype-money.html),
[decimal.js](https://mikemcl.github.io/decimal.js/)

## Frontend Application Stack

**Decision**: Use React 19.2, Vite 8, React Router in SPA mode, MUI Core for accessible
responsive primitives, TanStack Query v5 for server state, and React Hook Form for
multi-line operational forms. Use local React state for ephemeral UI state; do not add
a global client-state library initially. Run `tsc --noEmit` separately because Vite
transpiles rather than type-checks TypeScript.

**Rationale**: The application has multiple role-specific CRUD and state-machine flows.
These tools address routing, consistent form controls, remote-state lifecycle, repeated
line arrays, and server error mapping without moving business authority into the UI.

**Alternatives considered**:

- Bespoke `fetch`/`useEffect` caching and fully controlled form infrastructure:
  rejected because it recreates invalidation, pending/error, dirty-state, and repeated-
  field behavior throughout the application.
- Redux/Zustand: deferred because no independent complex client state is currently
  required.
- Licensed MUI X tiers: excluded unless separately approved; ordinary MUI tables or the
  MIT community grid are sufficient initially.

**Sources**: [React versions](https://react.dev/versions),
[Vite guide](https://vite.dev/guide/),
[MUI](https://mui.com/material-ui/getting-started/),
[TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)

## Portable Documents

**Decision**: Generate canonical PDFs in the API from committed immutable records using
PDFKit and server-owned templates. Stream them as `application/pdf` with a stable
`Content-Disposition` filename. Browser download is the universal baseline; Web Share
file sharing is progressive enhancement after `navigator.canShare` succeeds. Persist
document generation and output attempts separately from source business transactions.

**Rationale**: The first-release documents are sale tickets, load sheets, cash closes, and
tabular reports; PDFKit avoids a headless-browser runtime while supporting streaming,
text, and tables. Building documents from committed records preserves reproducibility
and separates output failure from transaction success.

**Alternatives considered**:

- Puppeteer/Chromium: reserve for future layouts that require full HTML/CSS fidelity;
  rejected initially due to its larger operational footprint.
- Client-generated canonical PDFs: rejected because transient UI state must not define
  historical business documents.

**Sources**: [PDFKit](https://pdfkit.org/docs/getting_started.html),
[Web Share](https://w3c.github.io/web-share/)

## Bluetooth Thermal Printing

**Decision**: Implement a browser-side `PrinterAdapter` boundary with one approved
Web Bluetooth BLE/GATT adapter in the first release. Require HTTPS, a current approved
Chromium browser/OS pair, a user gesture for device selection, filtered service UUIDs,
and a restrictive `Permissions-Policy: bluetooth=(self)`. Store supported printer model,
transport, protocol, UUID, paper width, encoding, and command-dialect metadata on the
server, but keep the browser-granted device handle local. Print only from committed
document records. Partial/disconnected writes become `UNKNOWN` and require an explicit
user reprint; they are never silently retried.

**Rationale**: Web Bluetooth exposes BLE GATT, not arbitrary Bluetooth printers. Browser
permissions are per origin/profile, and transport success cannot prove paper output.
Separating the adapter and explicit attempt states prevents a retry from resubmitting a
sale or falsely claiming physical output.

**Alternatives considered**:

- Bluetooth Classic SPP through Web Serial: a future hardware-specific adapter after
  acceptance testing, not part of the initial baseline.
- Safari/iOS direct Bluetooth: rejected because WebKit does not implement Web Bluetooth.
- Native/local print bridge: contingency only if approved hardware is Classic-only,
  unattended output is required, or the target browser cannot use BLE GATT.

**Sources**: [Web Bluetooth specification](https://webbluetoothcg.github.io/web-bluetooth/),
[Chrome Web Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth),
[WebKit position](https://webkit.org/tracking-prevention/)

## Testing Strategy

**Decision**: Use Vitest for domain, API-service, formatter, adapter, and React component
tests; React Testing Library for user-visible component/form behavior; Supertest for
Express contract/authorization tests; Testcontainers with PostgreSQL 18 for integration,
migration, transaction, rollback, lock, and idempotency tests; and Playwright for
critical end-to-end workflows on Chromium, Firefox, and WebKit. Bluetooth automation
uses a fake transport in CI and Chromium Bluetooth emulation where useful; actual
printer acceptance remains a required manual hardware test.

**Rationale**: The layers correspond directly to the constitution's unit, database,
authorization, contract, retry, rollback, and E2E gates. A real PostgreSQL instance is
required because an in-memory substitute cannot reproduce isolation, locks, partial
indexes, or numeric behavior.

**Alternatives considered**:

- SQLite for integration tests: rejected because its concurrency, types, and constraints
  differ materially from PostgreSQL.
- Browser tests only in Chromium: rejected for ordinary workflows; direct Bluetooth is
  the intentionally Chromium-only exception.
- Mock-only printer acceptance: rejected because it cannot verify protocol, encoding,
  paper width, partial output, or hardware failure behavior.

**Sources**: [Vitest](https://vitest.dev/guide/why.html),
[Testing Library](https://testing-library.com/docs/react-testing-library/intro/),
[Playwright browsers](https://playwright.dev/docs/browsers),
[Testcontainers for Node.js](https://node.testcontainers.org/)

## Performance and Human Usability Acceptance

**Decision**: Create a deterministic performance fixture containing exactly 10,000
products, 10,000 customers, and 100,000 completed sales. Measure the SC-006 search and
SC-007 portable-document targets in separate closed-loop profiles, each with 25
concurrent users after an unmeasured warm-up. The search profile rotates evenly among
product, customer, and inventory searches. The document profile rotates evenly among
sale-ticket, route-load, cash-close, and report PDFs and uses distinct committed source
records to measure uncached generation. Each profile records at least 400 measured
requests, operation mix, elapsed times, percentile/pass counts, environment, and seed.

Separately conduct the human usability protocol with five Administrators and five
Drivers after the same standardized 15-minute introduction and without assistance
during one scored attempt. The Administrator workflow reconciles and closes a returned
route containing a documented difference. The Driver workflow completes a typical sale
of up to ten lines and obtains its sale ticket. All five Drivers must finish within two
minutes; at least 9 of all 10 participants must complete their workflow on the first
attempt.

**Rationale**: Fixed data and concurrency make performance evidence reproducible.
Automated browser tests verify software behavior but cannot substitute for the human
first-attempt and task-timing outcomes required by SC-003 and SC-009.

**Alternatives considered**:

- An unspecified "representative" load: rejected because results could not be compared
  between environments or releases.
- Automated E2E timing as usability evidence: rejected because automation does not
  measure whether a trained person can understand and complete the workflow.
- Informal staff demonstrations: rejected because participant, training, assistance,
  and pass criteria would be inconsistent.

## Migrations, Recovery, Configuration, and Logging

**Decision**: Keep immutable ordered migrations and use expand/backfill/verify/contract
for production data changes. Every production-affecting migration documents lock/duration
risk, validation queries, roll-forward, rollback applicability, and recovery point.
Require managed backups with PostgreSQL WAL-based point-in-time recovery and periodic
restore drills. Validate environment-specific configuration at API startup with Zod.
Emit redacted JSON operational logs to stdout using Pino/`pino-http`, with request ID,
actor ID, operation, safe entity IDs, outcome, status, and duration. Store audit events
in the database separately from operational logs.

**Rationale**: Database rollback is not always safe after new code writes new data;
verified roll-forward and point-in-time recovery are more reliable controls. Structured,
redacted logs support diagnosis without becoming the authoritative audit history.

**Alternatives considered**:

- Editing applied migration files: rejected because environments would no longer share
  a reproducible schema history.
- Logging request bodies by default: rejected because credentials and customer/financial
  data could leak.
- Using logs as audit records: rejected because retention and mutability guarantees differ.

**Sources**: [Kysely migrations](https://www.kysely.dev/docs/migrations),
[PostgreSQL PITR](https://www.postgresql.org/docs/current/continuous-archiving.html),
[Pino redaction](https://github.com/pinojs/pino/blob/main/docs/redaction.md)

## Resolved Risk and Acceptance Conditions

No planning clarification markers remain. One implementation risk is intentionally
carried as an acceptance condition: procurement MUST identify and test the exact thermal printer
model, firmware, BLE/Classic transport, GATT service/characteristic UUIDs, ESC/POS dialect,
paper width, encoding (including accented Spanish text), chunk limits, and disconnect
behavior. If the available hardware is incompatible with Web Bluetooth, the product
scope or architecture must be amended before claiming FR-033/FR-047 complete.

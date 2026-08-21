# Validation Quickstart: Warehouse Management Operations

**Purpose**: Runnable guide for proving the implemented feature against the
[specification](./spec.md), [data model](./data-model.md), and
[HTTP contract](./contracts/openapi.yaml). Commands below are the required workspace
interface to create during implementation; this planning phase does not scaffold code.

## Prerequisites

- Node.js 24 LTS and pnpm using the repository-pinned package-manager version.
- Docker-compatible container runtime for the disposable PostgreSQL 18 database.
- A current Chromium, Firefox, and WebKit browser installation for Playwright.
- HTTPS for any browser session exercising Web Bluetooth.
- For physical printing acceptance: the approved BLE/GATT thermal printer, exact
  PrinterProfile metadata, paper, and a supported current Chromium browser/OS pair.

Do not use production credentials or production data. Tests MUST create isolated data
and an isolated database.

## Required Environment

The API startup schema must validate, at minimum:

```text
NODE_ENV=test|development|production
DATABASE_URL=<PostgreSQL connection string>
SESSION_SECRET=<high-entropy secret from environment/secret manager>
APP_ORIGIN=https://<single allowed origin>
BUSINESS_TIMEZONE=America/Hermosillo
BUSINESS_CURRENCY=<ISO-4217 code>
PORT=<API port>
LOG_LEVEL=<structured log level>
DOCUMENT_STORAGE_PATH=<non-public generated-document location>
```

Never commit populated environment files. Tests should inject ephemeral values through
the test harness.

## Bootstrap the Development Environment

From the repository root after implementation scaffolding exists:

```bash
pnpm install --frozen-lockfile
pnpm db:test:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Expected result:

- `apps/api` starts only after configuration and database compatibility pass.
- `apps/web` serves the React application and sends `/api/v1` requests to the Express
  API on the same logical origin.
- The seed creates Administrator/Driver test identities, Magdalena and Caborca,
  representative units/categories/products/customers/prices, one vehicle, and an
  approved test PrinterProfile. Seed passwords are development-only.
- `GET /api/v1/health` returns `200 {"status":"ok"}` without disclosing configuration.

## Static and Contract Gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm contract:generate
pnpm contract:lint
pnpm contract:check-diff
pnpm build
```

Expected result:

- Frontend and API build independently.
- OpenAPI 3.1.2 generation is deterministic and matches
  `specs/001-warehouse-management/contracts/openapi.yaml` semantically.
- Frontend types regenerate without uncommitted differences.
- Contract lint reports no errors or warnings accepted without an explicit review.
- No browser bundle contains database credentials, session secrets, password hashes,
  or API-only domain services.

## Automated Test Gates

```bash
pnpm test:unit
pnpm test:api
pnpm test:integration
pnpm test:contract
pnpm test:e2e
```

The suites MUST prove:

- exact price selection, line rounding, sale totals, 50% gross partner share, and cash
  close reproduction without JavaScript `number` arithmetic;
- permitted and denied access for every Administrator/Driver operation;
- API input/output validation and RFC 9457 error shapes for 401, 403, 409, 422, 429,
  and representative 500 failures;
- database checks, partial active-route uniqueness, deterministic locks, Serializable
  retry handling, rollback, append-only movement/audit permissions, and migrations on
  a real PostgreSQL 18 container;
- direct-SQL and concurrent-writer enforcement of the CustomerPrice GiST exclusion
  constraint, including overlapping, adjacent, unbounded, and inactive ranges;
- same-transaction AuditEvent presence for every mutation class in the data-model
  coverage matrix, mutation rollback when audit insertion fails, and no success audit
  record when the source mutation rolls back;
- duplicate identical idempotency requests replay one result, while a changed request
  under the same key returns 409;
- frontend handling of loading, empty, validation, authorization, conflict, retryable,
  and unexpected failure states;
- critical workflows in Chromium, Firefox, and WebKit, except direct Bluetooth which
  is explicitly Chromium/hardware constrained;
- document and printer retries never resubmit source business mutations;
- the portable/thermal capability matrix is enforced by the API and database, including
  rejection of REPORT print/reprint and printer-profile requirements for printable
  document attempts.

## Migration and Recovery Gate

Run migrations against both an empty database and a production-like sanitized fixture:

```bash
pnpm db:test:reset
pnpm db:migrate
pnpm db:verify
pnpm db:recovery:test
```

For each production-affecting migration, attach evidence of:

1. Preconditions and expected table-lock/runtime impact.
2. Expand/backfill/verify/contract sequencing where data shape changes.
3. Post-migration invariant queries and application smoke tests.
4. Tested roll-forward and whether application rollback remains compatible.
5. Recovery point and a successful disposable-environment restore/PITR drill when the
   migration is destructive or large.

An unapplied, modified-in-place, or unverified migration fails the gate.

## End-to-End Acceptance Walkthrough

Use unique idempotency keys for every critical command and retain the resulting IDs for
cross-checking the ledger and audit history.

### 1. Inventory by Branch

1. Log in as Administrator.
2. Create a unit, category, and product with an exact standard price and low-stock
   threshold.
3. Record an entry at Magdalena, transfer part to Caborca, then create positive and
   negative adjustments with reasons.
4. Attempt a decrement beyond the available balance.

Expected:

- Each accepted operation creates one atomic InventoryOperation and immutable movement
  records whose resulting balances reproduce the current balances.
- The rejected operation returns 409/422 as defined by its cause and changes neither
  balance nor history.
- The low-stock alert changes at the configured threshold.

### 2. Customer, Price, Route, and Sale

1. As Administrator, create an individually registered customer and a time-effective
   customer-specific product price.
2. Create and assign a Preparing route from Magdalena to a Driver and unused vehicle.
3. Log in as that Driver, record the draft load, confirm it, and start the route.
4. Confirm a sale using only loaded products and the existing customer.
5. Replay the identical confirmation with the same Idempotency-Key, then send changed
   content under that key.
6. Attempt an anonymous sale, a price override, an unavailable product, and a sale from
   another driver's route.

Expected:

- The customer price is selected and preserved as a decimal string; the driver cannot
  edit it.
- One accepted confirmation produces exactly one Sale, Sale Ticket, movement set, and
  route deduction. Identical replay returns it; changed replay conflicts.
- Every invalid attempt is rejected with no partial sale, sale ticket, or stock deduction.

### 3. Return, Difference, Reconciliation, and Closure

1. As the assigned Driver, move the route from En Route to Returned.
2. Verify further sales are rejected.
3. As Administrator, submit physical quantities that include at least one shortage and
   a mandatory reason.
4. Approve reconciliation and close the route.
5. Attempt an ordinary change to the Closed route.

Expected:

- Reconciliation creates the exact positive/negative difference adjustment and route
  return movements atomically.
- `initial load = sold + returned + documented differences` for every product.
- Every route balance is zero before closure; only the Administrator can approve/close.
- The Closed route rejects ordinary changes while preserving its full history.

### 4. Authorization and Archival

1. As Driver, attempt product, customer-create, user, inventory-adjustment, report, sale-
   cancellation, reconciliation, and route-close operations.
2. Create records for two Drivers. As the first Driver, list and retrieve that Driver's
   own completed sales and the load, movements, reconciliation, and closure history for
   an assigned Closed route.
3. As the first Driver, try to list or directly retrieve the second Driver's sale and
   route history, including by supplying the second Driver's ID as a filter.
4. As Administrator, generate/save/share all four document types and print a Sale
   Ticket, confirmed route load, and cash close. Then generate an own-sale Ticket and
   assigned confirmed-route-load output before the first Driver accesses them.
5. As the first Driver, generate/download/share/print an own-sale Ticket and assigned
   confirmed route load, including the outputs created by the Administrator. Attempt
   the second Driver's Ticket, an unassigned route load, CASH_CLOSE, REPORT, and a DRAFT
   route load through list filters, direct document IDs, content/share URLs,
   PRINT/REPRINT, and manipulated source IDs.
6. As Administrator, retrieve both Drivers' records and deactivate a customer/product/
   user referenced by history.
7. Attempt to deactivate a driver or vehicle assigned to an active route.

Expected:

- Every Driver administrator-only attempt returns 403 without changes.
- Driver lists are server-filtered to the authenticated Driver; direct access to another
  Driver's sale or route returns 403, while assigned Closed-route history remains
  available.
- Document authorization follows the immutable Sale/Route source rather than output
  creator. Forbidden or DRAFT-load requests return the defined 403/409 response without
  exposing metadata/bytes or creating a DocumentOutput, accepted OutputAttempt, storage
  write, or Bluetooth-device write. Reusing an existing output never bypasses access.
- Historical sales, movements, prices, and actor attribution remain available after
  archival.
- Active assignment conflicts return 409 until resolved.

### 5. Sale Cancellation

1. As Administrator, cancel a completed sale with a reason while its route can still
   receive movements.
2. Repeat with a sale whose route has already closed.
3. Retry each cancellation using the original key and attempt a second distinct
   cancellation.

Expected:

- The original sale remains, status becomes Cancelled once, and inverse movements
  restore exact quantities to the route or origin branch according to route state.
- Replays do not restore stock twice; a second cancellation conflicts.

### 6. Cash Close and Reports

1. Create sales spanning all reporting groups and a business-day boundary.
2. Generate day/week/month reports and a saved cash close.
3. Change current prices/category names after the close and retrieve it again.

Expected:

- Period boundaries use the configured business timezone.
- Category totals sum to exact gross sales; partner amount is 50% of gross and the
  remaining amount is exact under the documented rounding rule.
- The saved close remains byte-for-byte numerically reproducible from its snapshots and
  contributing sale IDs after catalog changes.

### 7. Documents, Sharing, and Printing

1. Request PDFs for a committed sale ticket, confirmed route load, cash close, and
   report snapshot.
2. Download each in every supported browser; test sharing for each only where Web Share
   and `canShare` allow it.
3. Request generate/save/share/print/reprint for a DRAFT route load, then confirm the
   same load and repeat the authorized output request.
4. Deny document storage or simulate generation failure, then retry after restoration.
5. In approved Chromium over HTTPS, select the approved BLE printer through a user
   gesture, test it, then print and content-compare the sale ticket, route load, and
   cash close.
6. Attempt to print and reprint the report, then disconnect during one supported
   document write and explicitly reprint that supported document.

Expected:

- PDFs match committed sources, use `application/pdf` and stable filenames, and become
  ready within SC-007's threshold in at least 95% of the exact measured document
  profile defined below.
- Unsupported sharing falls back to download.
- The route-load PDF matches its confirmed immutable source and can be saved or shared.
- Every DRAFT-load output mode is rejected with 409 before generation or device access;
  confirmation permits a subsequent authorized request without any draft output or
  accepted attempt having been created.
- Report printing/reprinting is rejected with 422 before a Bluetooth write, creates no
  accepted PRINT/REPRINT OutputAttempt, and leaves the report snapshot and document
  output unchanged.
- Generation failure is visible and retryable without altering the source record.
- A partial/disconnected print is `UNKNOWN`, is not silently retried, and never creates
  a second sale/load/close. Explicit reprint creates only a new OutputAttempt.

## Physical Printer Acceptance Matrix

Record and approve all fields before FR-033/FR-047 can pass:

| Area | Required evidence |
|---|---|
| Hardware | Manufacturer, model, firmware, paper width |
| Client | Device model, OS/version, Chromium browser/version |
| Transport | BLE/GATT confirmation, service UUID, write characteristic, write mode |
| Protocol | ESC/POS dialect, initialization/cut/feed commands, chunk size and delay |
| Content | Sale-ticket, confirmed-route-load, and cash-close templates; Spanish accents, currency symbols, wrapping, long names, and line items |
| Failures | Permission denial, unsupported browser, disconnect, partial output, out of paper, reconnect, explicit reprint |
| Negative scope | REPORT print/reprint rejected before a device write, with no accepted print attempt or source change |

If the available printer is Bluetooth Classic-only, requires iOS/Safari direct access,
or needs unattended silent printing, stop and amend the plan; the approved browser-only
BLE design does not satisfy those conditions.

## Performance and Completion Evidence

Create a deterministic acceptance fixture containing exactly 10,000 products, 10,000
customers, and 100,000 completed sales. After an unmeasured warm-up, run two separate
closed-loop profiles with 25 concurrent users and at least 400 measurements each:

1. Use 25 concurrent authenticated browser sessions and rotate visible search actions
   evenly among matching and no-results product, customer, and inventory searches.
   Start at the user action and stop only after loading ends, matching rows or an
   explicit no-results state is visible, identifying fields and relevant values are
   rendered, and every result action available to that user is enabled. The browser
   harness must assert all four conditions before recording completion.
2. Rotate document requests evenly among sale-ticket, confirmed-route-load, cash-close,
   and report PDFs, using distinct committed or confirmed sources to measure uncached
   generation.

Record the exact seed, environment, operation mix, sample count, elapsed times,
percentiles, and pass counts, and prove:

- at least 95% of product/customer/inventory searches satisfy all four visible DOM
  completion conditions within two seconds, using end-to-end browser timing rather
  than API response time;
- at least 95% of PDF requests become ready within ten seconds;
- concurrent last-unit, multi-line sale/load, and overlapping-route tests preserve all
  constraints with observable bounded retry behavior.

Conduct the human usability acceptance separately:

1. Recruit five Administrators and five Drivers.
2. Freeze and version one standardized 15-minute introduction script and give the same
   version to every participant.
3. Allow no assistance during one scored attempt. A first attempt is one uninterrupted
   run after the start signal; ordinary correction before final submission remains in
   the run, but a rejected final submission, any restart, or any assistance fails the
   attempt.
4. Start each Driver authenticated at the same defined screen with an assigned EN_ROUTE
   route, sufficient stock, an existing customer, exactly 10 requested line items, and
   a payment method. Start timing at task handoff and stop only when the completed sale
   ticket is visibly available. Every Driver must finish in under two minutes.
5. Start each Administrator authenticated at the same defined screen with a Returned
   route whose expected and physical quantities create exactly one nonzero difference.
   The participant must record the mandatory reason, approve reconciliation, return
   stock, and close the route; success requires CLOSED state and zero route inventory.
6. Record participant role, introduction/fixture version, start/end timestamps, elapsed
   time, first-attempt result, assistance (which must be none), and failure reason.
7. Require all five Drivers to pass the timing target and at least 9 of all 10
   participants to complete their assigned workflow on the first attempt.

The feature is ready for review only when all applicable commands pass in a clean
environment, the physical-printer matrix is approved, migration/recovery evidence is
attached, no contract diff is unexplained, and a reviewer records constitution
compliance.

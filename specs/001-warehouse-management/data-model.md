# Data Model: Warehouse Management Operations

**Date**: 2026-08-21
**Feature**: [Warehouse Management Operations](./spec.md)  
**Research**: [Phase 0 decisions](./research.md)

## Modeling Conventions

- PostgreSQL is authoritative. All primary keys are UUIDs; user-visible document and
  route numbers are separate immutable unique values.
- All timestamps are `timestamptz` stored in UTC. Reporting converts them using the
  configured business timezone captured on saved summaries.
- Quantities use `numeric(18,3)`. APIs serialize quantities as canonical decimal
  strings and validate the product unit's allowed precision.
- Configurable/unit prices use `numeric(19,4)`. Finalized line amounts, totals, and
  shares use `numeric(19,2)`. APIs serialize all monetary values as decimal strings.
- Mutable business records include `created_at`, `updated_at`, and integer `version`.
  Catalog/history references use restrictive foreign keys and archival timestamps;
  historical rows are never cascade-deleted.
- Enum values are stored as uppercase stable codes. Display labels are localized in
  the frontend and are not persisted as domain states.
- Immutable ledgers (`inventory_movement`, `audit_event`) grant the runtime database
  role `SELECT` and `INSERT` only. Corrections append compensating rows.

## Identity, Access, and Cross-Cutting Records

### User

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `username` | case-insensitive text | Required, unique normalized value |
| `display_name` | text | Required |
| `password_hash` | text | Required Argon2id PHC string; never returned by API |
| `role` | `ADMINISTRATOR \| DRIVER` | Required |
| `active` | boolean | Defaults true |
| `archived_at` | timestamptz? | Disables future use but preserves attribution |
| `created_at`, `updated_at` | timestamptz | Required |
| `version` | integer | Optimistic concurrency token |

Rules:

- Deactivation revokes active sessions in the same transaction.
- A driver with a non-Closed route cannot be deactivated until the route is reassigned
  or closed.
- Role changes regenerate/revoke existing sessions and emit an audit event.

### AuthSession

| Field | Type | Rules |
|---|---|---|
| `id` | text | Opaque session identifier; primary key |
| `user_id` | UUID | Required User reference |
| `csrf_secret_hash` | text | Required; never returned directly |
| `created_at`, `last_seen_at` | timestamptz | Required |
| `idle_expires_at`, `absolute_expires_at` | timestamptz | Required |
| `revoked_at`, `revoked_reason` | timestamptz?, text? | Set on logout/deactivation/privilege change |

### IdempotencyRequest

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `actor_id` | UUID | Required User reference |
| `operation_type` | stable code | Required |
| `idempotency_key` | text | Required, bounded length |
| `request_hash` | text | Hash of canonical validated request |
| `state` | `IN_PROGRESS \| COMPLETED` | Required |
| `resource_type`, `resource_id` | text?, UUID? | Result reference |
| `http_status`, `response_snapshot` | integer?, jsonb? | Safe replay result |
| `created_at`, `completed_at` | timestamptz, timestamptz? | Required/conditional |

Unique: `(actor_id, operation_type, idempotency_key)`. A duplicate key with the same
hash replays the completed result; a different hash is a conflict. The row and business
mutation commit together.

### AuditEvent

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `actor_id` | UUID | Required historical User reference |
| `occurred_at` | timestamptz | Required |
| `action` | stable code | Required |
| `entity_type`, `entity_id` | text, UUID | Required |
| `reason` | text? | Required for corrections, archival, cancellation, and differences |
| `before_values`, `after_values` | jsonb?, jsonb? | Relevant safe fields only |
| `operation_id`, `request_id` | UUID?, text? | Correlation identifiers |

This table is append-only. Authentication secrets, password hashes, and session tokens
MUST NOT appear in snapshots.

### Audit Coverage and Atomicity

Every security-sensitive or business-critical mutation inserts its AuditEvent in the
same database transaction as the changed record. Audit insertion failure rolls back the
mutation, and mutation failure leaves no success AuditEvent. `before_values` come from
the locked or version-checked row and `after_values` from the candidate committed state.
Typed action codes and field allowlists exclude credentials, password hashes,
session/CSRF tokens, and browser device handles. The runtime database role has
`SELECT`/`INSERT` but no `UPDATE`/`DELETE` privilege on `audit_event`.

| Mutation class | Required audited actions |
|---|---|
| Users and access | Create/edit, activation/deactivation, role/password change, and privilege/deactivation-driven session revocation |
| Catalog and configuration | Product, category, unit, location, vehicle, customer, and customer-price create/edit/archive/deactivate; BusinessSetting, PrinterProfile, and UserPrinterPreference changes |
| Inventory | Entry, manual exit, transfer, positive/negative adjustment, and reversal |
| Routes | Create/assignment, load confirmation, start, return, reconciliation approval, difference, closure, and correction |
| Sales and finance | Sale confirmation/cancellation, CashClose creation, and persisted ReportSnapshot creation |

InventoryMovement and OutputAttempt are specialized immutable ledgers, but they do not
replace the AuditEvent required for the related source mutation. Integration tests must
assert both audit presence and rollback-on-audit-failure for every mutation class.

## Catalog and Configuration

### BusinessSetting

Singleton configuration with a stable UUID `id` used for audit attribution,
`currency_code`, `currency_scale` (initially 2), `business_timezone`,
`partner_share_rate` (`numeric(9,6)` constrained to `0.500000` for this release),
`money_rounding_mode` (`HALF_AWAY_FROM_ZERO`), `updated_by`, timestamps, and version.
Every saved sale/cash close copies the relevant values it used. The partner rate is not
an editable operational setting while FR-026 fixes it at 50 percent.

### Location

`id`, unique `code`, `name`, `active`, `archived_at`, timestamps, and version. Seed
Magdalena and Caborca as initial rows; do not hard-code their IDs in domain logic.

### Category

`id`, unique normalized `name`, `reporting_group` (`SODAS | CHARCOAL | TOSTADAS |
OTHER`), `active`, `archived_at`, timestamps, and version. Sales snapshot both name and
reporting group so later renaming/reclassification does not rewrite reports.

### Unit

`id`, unique `code`, `name`, `quantity_scale` (integer 0 through 3), `active`,
`archived_at`, timestamps, and version. `quantity_scale=0` requires whole-unit sale and
movement quantities.

### Product

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `sku` | text | Required, unique normalized code |
| `name`, `description` | text, text? | Name required |
| `category_id`, `unit_id` | UUID | Required active references for new activity |
| `standard_unit_price` | numeric(19,4) | Nonnegative |
| `low_stock_threshold` | numeric(18,3) | Nonnegative |
| `active`, `archived_at` | boolean, timestamptz? | Historical references remain valid |
| timestamps, `version` | standard | Required |

### Customer

`id`, unique customer number, required display/legal name, optional contact name,
phone, email, address, city, notes, `active`, `archived_at`, timestamps, and version.
Drivers receive only fields required to identify/select the customer and complete a
sale.

### CustomerPrice

`id`, `customer_id`, `product_id`, `unit_price numeric(19,4)`, `valid_from`, optional
`valid_to`, `active`, `created_by`, timestamps. Validity uses half-open UTC periods
`[valid_from, valid_to)`; a null `valid_to` is unbounded. Price must be nonnegative and
`CHECK (valid_to IS NULL OR valid_to > valid_from)` applies. A stored/generated
`tstzrange` validity period (or equivalent immutable expression) participates in a
partial GiST exclusion constraint using `btree_gist`:

```sql
EXCLUDE USING gist (
  customer_id WITH =,
  product_id WITH =,
  valid_period WITH &&
) WHERE (active)
```

This permits adjacent ranges and inactive historical rows but rejects active overlap,
including concurrent direct SQL writes. Historical sale lines reference the price row
when used and also persist the applied price.

### Vehicle

`id`, unique `code`, `name`, optional `registration`, `active`, `archived_at`,
timestamps, and version. A vehicle cannot be deactivated while assigned to a non-Closed
route.

### PrinterProfile

Administrator-controlled supported hardware metadata: `id`, `name`, `model`,
`transport` (initially `WEB_BLUETOOTH_BLE`), GATT service/write-characteristic UUIDs,
write mode, command dialect, encoding, paper width, maximum chunk size, inter-chunk
delay, `active`, timestamps, and version. This describes compatible hardware but does
not grant browser device permission.

### UserPrinterPreference

One row per user: `user_id`, optional `printer_profile_id`, non-sensitive device label,
last tested browser/OS, `last_tested_at`, `last_test_result`, and timestamps. A Web
Bluetooth device handle remains browser-local and is never stored as a credential.

## Inventory Ledger

### StockLocation

A uniform inventory owner used to preserve database foreign keys.

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `kind` | `BRANCH \| ROUTE` | Required |
| `branch_id` | UUID? | Required only for BRANCH, unique |
| `route_id` | UUID? | Required only for ROUTE, unique |

Check: exactly one of `branch_id` or `route_id` is present and matches `kind`. A route
stock location is created with its route and retained after closure with zero balances.

### InventoryBalance

`id`, `stock_location_id`, `product_id`, `quantity numeric(18,3)`, `updated_at`, and
`version`. Unique `(stock_location_id, product_id)` and check `quantity >= 0`.

The row is a concurrency-controlled projection. The immutable movement ledger must
reproduce it exactly.

### InventoryOperation

Groups all balance changes from one atomic business action: `id`, `operation_type`
(`ENTRY`, `MANUAL_EXIT`, `TRANSFER`, `ROUTE_LOAD`, `SALE`, `ROUTE_RETURN`,
`POSITIVE_ADJUSTMENT`, `NEGATIVE_ADJUSTMENT`, `SALE_CANCELLATION`), `actor_id`,
`reason`, related entity type/ID, `idempotency_request_id`, and `occurred_at`.

Reason is mandatory for manual exits, adjustments, cancellations, and route
differences.

### InventoryMovement

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key; append-only |
| `operation_id` | UUID | Required InventoryOperation reference |
| `product_id` | UUID | Required historical Product reference |
| `source_stock_location_id` | UUID? | Absent only for entry/positive creation |
| `destination_stock_location_id` | UUID? | Absent only for exit/sale/negative removal |
| `quantity` | numeric(18,3) | Strictly positive magnitude |
| `source_balance_after` | numeric(18,3)? | Required when source exists |
| `destination_balance_after` | numeric(18,3)? | Required when destination exists |
| `actor_id`, `occurred_at`, `reason` | standard | Actor/time required |
| `related_entity_type`, `related_entity_id` | text, UUID | Required traceability |
| `reverses_movement_id` | UUID? | References original when compensating |

Checks require at least one endpoint, prohibit the same source/destination, and match
endpoint presence to resulting-balance presence.

## Routes, Loads, and Reconciliation

### Route

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `route_number` | text | Immutable unique business identifier |
| `state` | `PREPARING \| EN_ROUTE \| RETURNED \| CLOSED` | Required |
| `origin_location_id` | UUID | Required branch reference |
| `driver_id`, `vehicle_id` | UUID | Required references |
| `business_date` | date | Required in business timezone |
| `created_by`, `created_at` | UUID, timestamptz | Required |
| `started_at`, `returned_at`, `closed_at` | timestamptz? | Set by transition |
| `closed_by` | UUID? | Administrator when Closed |
| `version` | integer | Conditional transition token |

Partial unique indexes on `driver_id` and `vehicle_id` where state is PREPARING,
EN_ROUTE, or RETURNED prevent overlapping active assignments.

### RouteLoad and RouteLoadLine

One RouteLoad per route with `state` (`DRAFT | CONFIRMED`), `recorded_by` (the assigned
driver), `confirmed_at`, `inventory_operation_id`, timestamps, and version. RouteLoadLine
contains unique `(route_load_id, product_id)`, positive `quantity`, and product/unit
snapshots. Confirmed loads are immutable; corrections use movements/reversals.

Load confirmation locks all branch and route balance rows, transfers the full load in
one transaction, and fails without changes if any branch quantity is insufficient.

### RouteReconciliation and RouteReconciliationLine

One reconciliation per Returned route with `state` (`DRAFT | APPROVED`), `recorded_by`,
`approved_by`, `approved_at`, `return_operation_id`, timestamps, and version.

Each line stores `product_id`, `loaded_quantity`, `sold_quantity`,
`expected_return_quantity`, `physical_return_quantity`, `difference_quantity`, optional
mandatory-if-nonzero `difference_reason`, and the positive/negative adjustment movement
reference. Quantities and the product/unit identity are snapshots.

`difference_quantity = expected_return_quantity - physical_return_quantity`, so the
signed reconciliation identity is `loaded = sold + physical returned + difference`:

- positive (shortage): append a negative route adjustment before returning the physical
  quantity;
- negative (overage): append a positive route adjustment before returning the physical
  quantity;
- zero: no difference adjustment or reason is permitted.

Approval and return-to-origin occur in one administrator transaction. It MUST leave
every route balance at zero. Only an approved reconciliation permits closure.

### Route State Machine

| Current | Action and actor | Preconditions | Next |
|---|---|---|---|
| PREPARING | Assigned driver starts | Load is CONFIRMED | EN_ROUTE |
| EN_ROUTE | Assigned driver returns | No concurrent sale commit | RETURNED |
| RETURNED | Administrator closes | Reconciliation APPROVED; every route balance zero | CLOSED |

No other transition is valid. A conditional update includes the expected current state
and version. Closed routes reject ordinary changes; corrections reference the route
through new adjustment/reversal operations without changing its state or history.

## Sales and Sale Tickets

### Sale

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `sale_number` | text | Immutable unique business identifier |
| `client_operation_id` | UUID | Unique retry/deduplication invariant |
| `status` | `COMPLETED \| CANCELLED` | Required |
| `customer_id`, `driver_id`, `route_id`, `origin_location_id` | UUID | Required |
| `payment_method` | `CASH \| BANK_TRANSFER \| CARD` | Informational only |
| `currency_code` | char(3) | Historical snapshot |
| `subtotal`, `total` | numeric(19,2) | Exact finalized amounts |
| `rounding_mode` | stable code | Historical snapshot |
| `completed_at` | timestamptz | Required |
| `inventory_operation_id`, `idempotency_request_id` | UUID | Required |
| `cancelled_at`, `cancelled_by`, `cancellation_reason` | conditional | Set on cancellation |

Sale confirmation requires an active individually registered customer, the assigned
driver, an EN_ROUTE route, and all requested products in that route. Sale, lines,
balance updates, movement, sale ticket, idempotency result, and audit event commit
together.
The API computes an advisory price/availability preview from the same domain service,
but confirmation revalidates every input and recalculates authoritatively.

### SaleLine

`id`, `sale_id`, sequence, `product_id`, optional `customer_price_id`, product/category/
reporting-group/unit snapshots, `quantity numeric(18,3)`, `unit_price numeric(19,4)`,
`line_amount numeric(19,2)`, and applied price source (`CUSTOMER | STANDARD`). Unique
`(sale_id, sequence)` and `(sale_id, product_id)` unless duplicate product lines are
later explicitly required. Positive quantity and nonnegative price/amount checks apply.

### SaleCancellation

One row per cancelled sale: `id`, unique `sale_id`, administrator `actor_id`, mandatory
`reason`, destination stock location, `inventory_operation_id`, `idempotency_request_id`,
and `created_at`. It preserves the Sale and appends inverse movements exactly once.
The route is a valid cancellation destination only while it remains EN_ROUTE; after it
is Returned or Closed, restored stock goes to the origin branch without reopening or
rewriting route history.

### SaleTicket

One immutable `sale_ticket` row per sale with unique `ticket_number`, `sale_id`,
printable snapshot JSON, content version, and `created_at`. `TICKET` remains the stable
API document-type code. No second customer-facing entity or document type exists.
Reprints always reference this record.

## Cash Closing and Reporting

### CashClose, CashCloseLine, and CashCloseSale

CashClose stores an immutable unique close number, period start/end, business timezone,
currency, gross total, partner rate, partner amount, remaining amount, rounding mode,
creator, idempotency request, and creation time. CashCloseLine stores one row per
reporting group with exact total. CashCloseSale links every contributing Sale and its
included amount. These snapshots make the result reproducible after catalog changes.

### ReportSnapshot

Interactive reports are database queries and are not stored by default. Requesting a
portable report first creates ReportSnapshot with report kind, validated filter/period
JSON, business timezone, source watermark, exact result snapshot, creator, and creation
time. Document output references this immutable snapshot.

## Document and Print Output

### DocumentOutput

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | Primary key |
| `document_type` | `TICKET \| ROUTE_LOAD \| CASH_CLOSE \| REPORT` | Required; `TICKET` means SaleTicket |
| `source_type`, `source_id` | stable code, UUID | Required immutable source |
| `content_version`, `content_hash` | text | Required |
| `storage_key` | text? | Set if generated bytes are retained |
| `state` | `PENDING \| READY \| FAILED` | Required |
| `created_by`, `created_at`, `ready_at` | standard | Required/conditional |
| `last_error_code` | text? | Safe diagnostic code only |

Creation/generation is post-commit relative to the source transaction. A unique key on
`(document_type, source_type, source_id, content_version)` prevents accidental duplicate
canonical outputs while allowing a new template version. A ROUTE_LOAD output requires
the referenced RouteLoad to be CONFIRMED and therefore immutable. The generation
transaction locks/reads the RouteLoad and rejects DRAFT before inserting DocumentOutput;
a database constraint trigger (or equivalent schema-enforced confirmed-load reference)
also rejects direct or racing inserts for a DRAFT load. Add a unique `(id,
document_type)` key so OutputAttempt can enforce its document-type capability by
composite foreign key.

Valid document/source pairs are `TICKET/SALE`, `ROUTE_LOAD/ROUTE_LOAD`,
`CASH_CLOSE/CASH_CLOSE`, and `REPORT/REPORT_SNAPSHOT`; both database checks and the HTTP
request schema reject every other pairing. REPORT/REPORT_SNAPSHOT is portable-only.

| Document type | Generate | Download/save | Share | Print/reprint |
|---|---:|---:|---:|---:|
| `TICKET` | Yes | Yes | Yes | Yes |
| `ROUTE_LOAD` | Yes | Yes | Yes | Yes |
| `CASH_CLOSE` | Yes | Yes | Yes | Yes |
| `REPORT` | Yes | Yes | Yes | No |

### Document Authorization Projection

Authorization derives from the immutable source relationship, never from
`DocumentOutput.created_by`. A Driver may therefore access an otherwise authorized
output originally created by an Administrator, and cannot access an unauthorized
output even when its ID is known.

| Role | Generate/download/save/share | Print/reprint |
|---|---|---|
| Administrator | Any TICKET, confirmed ROUTE_LOAD, CASH_CLOSE, or REPORT | Any TICKET, confirmed ROUTE_LOAD, or CASH_CLOSE; never REPORT |
| Driver | TICKET only when `Sale.driver_id = actor.id`; confirmed ROUTE_LOAD only when `Route.driver_id = actor.id`; never CASH_CLOSE or REPORT | Same source predicates; only TICKET and confirmed ROUTE_LOAD |

The TICKET predicate joins `DocumentOutput.source_id = Sale.id` and requires
`Sale.driver_id = authenticated_user.id`. The ROUTE_LOAD predicate joins
`DocumentOutput.source_id = RouteLoad.id`, joins its Route, and requires both
`RouteLoad.state = CONFIRMED` and `Route.driver_id = authenticated_user.id`. The same
predicate is applied when creating or reusing an output, listing or retrieving its
metadata, downloading/sharing its content, printing/reprinting, and reading or writing
OutputAttempt history. Driver-controlled IDs or filters never broaden it. TEST_PRINT
uses printer-profile authorization because it has no business document source.

An authorization or source-state denial creates no DocumentOutput or accepted
OutputAttempt, performs no document-storage or Bluetooth-device side effect, and does
not expose source metadata. Contract, integration, and E2E tests cover new and existing
outputs, direct IDs, content URLs, manipulated filters, DRAFT-load insertion/races, and
every denied role/source combination.

### OutputAttempt

`id`, nullable `document_output_id`, nullable copied `document_type`, `actor_id`, `mode`
(`GENERATE | DOWNLOAD | SHARE | PRINT | REPRINT | TEST_PRINT`), optional
`printer_profile_id`, `state` (`STARTED | SUCCEEDED | FAILED | UNKNOWN`), safe error
code, attempt number, request ID, and timestamps.

For every mode except TEST_PRINT, `document_output_id` and copied `document_type` are
required and reference DocumentOutput through composite foreign key
`(document_output_id, document_type) -> (id, document_type)`. PRINT and REPRINT require
`printer_profile_id` and a document type in `TICKET | ROUTE_LOAD | CASH_CLOSE`; a CHECK
constraint rejects REPORT. GENERATE, DOWNLOAD, and SHARE require no printer and accept
all four document types. TEST_PRINT requires `printer_profile_id` and has no document
reference or document type because it validates the printer profile rather than a
business document. The API performs the same validation before any browser Bluetooth
write, and integration tests bypass the service to prove the database constraints.

`UNKNOWN` is mandatory after an ambiguous partial/disconnected printer write. A retry
creates a new REPRINT attempt; it never recreates the source Sale, RouteLoad, CashClose,
or ReportSnapshot.

## Transaction Boundaries

The following operations use Serializable transactions and persisted idempotency:

1. Inventory entry, manual exit, adjustment, and transfer.
2. Route-load confirmation.
3. Route start, return, reconciliation approval, and closure.
4. Sale confirmation and cancellation.
5. Cash-close creation.

All affected balance rows are locked in `(stock_location_id, product_id)` order. The
transaction contains the business record, balance changes, InventoryOperation and
InventoryMovement rows, IdempotencyRequest completion, and AuditEvent. A failure leaves
none of them partially committed.

Document generation and output attempts are separate transactions after their source
record commits. Their failure never reverses or duplicates the source.

## Role-Scoped Read Projections

These are query projections, not additional stored ledgers:

- **DriverSaleHistory** applies `sale.driver_id = authenticated_user.id` in the
  repository/service query and includes the Driver's completed sales, preserved
  cancellation status, SaleTicket details, and only the customer fields permitted for
  assigned sales.
- **DriverRouteHistory** applies `route.driver_id = authenticated_user.id` and includes
  every assigned route in every state plus its load, movements, sales, reconciliation,
  differences, return, and closure history.
- Administrators may query system-wide sale and route history. Driver-provided
  `driver_id`, `sale_id`, or `route_id` values never broaden scope. Both list and
  direct-detail queries apply the ownership predicate and use the contract's consistent
  forbidden/not-found policy, with deny-path contract, integration, and E2E tests.

## Required Database Constraints and Indexes

- Nonnegative InventoryBalance and low-stock thresholds; positive sale/load quantities;
  strictly positive movement magnitude.
- Unique normalized usernames, location/category/unit/product/vehicle codes, and
  business document numbers.
- Unique balance per stock location/product and unique route stock location.
- Partial unique active route per driver and per vehicle.
- One load and one reconciliation per route; one sale ticket and at most one cancellation
  per sale.
- `btree_gist`-backed partial GiST exclusion of overlapping active CustomerPrice
  `[valid_from, valid_to)` ranges per customer/product, plus a valid-endpoint check.
- Unique idempotency tuple and critical client operation UUID.
- Search indexes for active products/customers, movement time/product/location, sale
  completion/customer/driver/route, route state/date/driver, and report period filters.
- Restrictive historical foreign keys; no cascade delete from catalog/identity records
  into business history.

Database integration tests must bypass application services and prove overlapping
CustomerPrice rejection, adjacent-range acceptance, unbounded and inactive range
behavior, and concurrent-writer enforcement.

## Migration and Recovery Rules

- Applied migration files are immutable and ordered. PostgreSQL-specific constraints,
  partial indexes, permissions, and triggers use reviewed SQL inside migrations.
- The controlled migration owner provisions the trusted `btree_gist` extension before
  creating the CustomerPrice exclusion constraint; the runtime role cannot manage
  extensions or weaken the constraint.
- Production data changes use expand/backfill/verify/contract and document lock impact,
  expected duration, validation queries, roll-forward steps, rollback applicability,
  and recovery point.
- The runtime role cannot mutate immutable ledger rows. A separate controlled migration
  owner applies schema changes.
- Backup/WAL point-in-time recovery and a disposable-environment restore drill must be
  proven before production-affecting destructive or large data migrations.

# Data Model: Warehouse Management Operations

All IDs are UUIDs. Mutable records have timestamps; historical records are append-only. Money is `numeric(14,2)`, quantities are `numeric(14,3)`, timestamps are UTC, and report boundaries use the configured IANA timezone.

## Identity and configuration

- **User**: email (unique), password hash, name, role (`ADMINISTRATOR|DRIVER`), active. Deactivation revokes sessions but preserves attribution.
- **Session**: user, unique token hash, expiration, revocation.
- **BusinessSetting**: currency, timezone, partner rate (`0.5000`). Changes are audited and cash closes snapshot values.
- **PrinterSetting**: user, display name, transport/device metadata, last test result, active. Drivers may select/test only their assignment.

## Catalog and customers

- **Location**: unique name, active. Seed Magdalena and Tucson.
- **Category**: unique name, cash-close group (`SODAS|CHARCOAL|TOSTADAS|OTHER`), active.
- **Product**: unique SKU, description, category, unit, standard price, current acquisition cost, supplier, low-stock threshold, active. Prices, costs, and thresholds are nonnegative. The current cost is catalog metadata and does not provide historical cost accounting.
- **Customer**: name, phone, address, city, active. Every sale requires an active individual customer.
- **CustomerPrice**: customer, product, positive price, validity interval, active. Active intervals for one customer/product cannot overlap.

## Inventory

- **InventoryBalance**: product, exactly one holder (`location_id` or `route_id`), nonnegative quantity, version. Unique per product/holder.
- **InventoryMovement**: product, holder, signed delta, balance after, type, actor, reason, related records, correlation ID, time. Immutable. A transfer creates linked outbound/inbound movements atomically.

The inventory overview derives its four product counts from active products and their
balances. Product detail derives total stock, shortage (`max(minimum - total, 0)`),
per-location balances, and recent movements; these are read models, not independent
mutable records.

Movement types: `ENTRY`, `MANUAL_EXIT`, `TRANSFER_OUT`, `TRANSFER_IN`, `ROUTE_LOAD_OUT`, `ROUTE_LOAD_IN`, `SALE`, `RETURN_OUT`, `RETURN_IN`, `ADJUSTMENT`, `CANCELLATION`.

## Routes

- **Vehicle**: unique name, optional plate, active.
- **Route**: origin, driver, vehicle, service date, status, creator and lifecycle timestamps. Driver and vehicle are each unique among non-closed routes.
- **RouteLine**: route/product (unique), loaded, sold, expected-return, physical-return, difference and adjusted quantities.
- **RouteDifference**: line, quantity, mandatory reason, approving administrator, approval time, adjustment movement.

```text
PREPARING --assigned driver confirms full load--> EN_ROUTE
EN_ROUTE --assigned driver returns--> RETURNED
RETURNED --administrator reconciles to zero--> CLOSED
```

Transitions cannot skip or reverse. Closed records accept only new traceable adjustments/reversals.

## Sales and finance

- **Sale**: customer, driver, route, origin, payment method, currency, total, status (`CONFIRMED|CANCELLED`), confirmation and cancellation metadata. Confirmed data is immutable.
- **SaleLine**: sale/product, product and category snapshots, quantity, applied unit price, price source (`CUSTOMER|STANDARD`), total.
- **Ticket**: unique sale and ticket number, source snapshot, creation time. Created atomically with sale.
- **CashClose**: local period, timezone/currency/rate snapshots, grouped totals, gross, partner, remaining, creator/time.
- **CashCloseSale**: contributing sale and amount snapshot; unique per cash-close/sale pair.

## Output, retry and audit

- **DocumentOutput**: source, output type (`PDF|THERMAL`), status, attempts, reference/hash, last error, requester and timestamps.
- **IdempotencyRecord**: actor, operation, key, request hash, status, response, resource and timestamps; unique by actor/operation/key.
- **AuditEvent**: actor, action, entity, sanitized before/after values, request ID and time. Immutable.

## Transaction invariants

- Every balance mutation and movement commit together.
- Balance rows lock in stable product/holder order before validation.
- Sale, lines, route deductions, movements and ticket form one transaction.
- Load/return transfer source and destination atomically.
- Cancellation preserves the sale and compensates exactly once.
- Closure requires zero route balances and full quantity reconciliation.
- An idempotency key reused with different input returns `409` without effects.

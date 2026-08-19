# Feature Specification: Warehouse Management Operations

**Feature Branch**: Not created (feature directory: `001-warehouse-management`)

**Created**: 2026-08-14

**Last Updated**: 2026-08-18

**Status**: Draft

**Input**: Build a browser-based system for inventory, customers, sales, routes, cash
closing, operational reporting, document generation, and thermal printing. Reconcile
the initial quotation with the expanded requirements and workflow document, treating
its screen examples as context and its recommendations as unapproved proposals.

## Clarifications

### Session 2026-08-18

- Q: May a driver create a new customer during an active route, or must the driver
  select an existing customer? → A: Drivers can only select existing customers;
  administrators create and edit them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Control Inventory by Location (Priority: P1)

An administrator maintains the product catalog and sees accurate stock for Magdalena,
Caborca, and active routes. Each entry, manual exit, adjustment, sale, load, transfer,
return, or cancellation explains why the balance changed so the administrator can
reconcile physical and recorded stock.

**Why this priority**: Reliable per-branch inventory is the foundation for sales,
delivery, cash closing, and reporting.

**Independent Test**: Create a product, establish and adjust its stock independently
at each branch, and verify that balances and movement history remain consistent.

**Acceptance Scenarios**:

1. **Given** an administrator and an active product, **When** the administrator records
   an entry and a transfer between branches, **Then** each branch shows the correct
   balance and linked movements.
2. **Given** an existing balance, **When** an authorized adjustment is recorded,
   **Then** the balance changes by that quantity and the history identifies the actor,
   time, reason, and resulting balance.
3. **Given** a configured low-stock threshold, **When** a balance reaches that
   threshold, **Then** the administrator sees an inventory alert for that product and
   branch.
4. **Given** insufficient stock, **When** an operation would make the balance negative,
   **Then** the operation is rejected without changing the balance or history.

---

### User Story 2 - Record a Customer Sale (Priority: P1)

A driver working an active route selects an existing customer and loaded products,
receives the applicable prices, confirms the sale, and obtains a ticket while route
inventory is reduced exactly once.

**Why this priority**: Recording sales is the primary revenue-producing workflow and
must keep customer, price, ticket, and stock records aligned.

**Independent Test**: Using preconfigured customer, product, price, and stock data,
complete a sale and verify the stored sale, ticket, customer history, and stock movement.

**Acceptance Scenarios**:

1. **Given** a customer with a special product price, **When** a driver adds that
   product to a sale, **Then** the special price is selected, cannot be edited by the
   driver, and is preserved on the sale.
2. **Given** sufficient stock in the driver's active route, **When** the driver confirms
   a sale with a payment method, **Then** one sale and one ticket are created, the
   payment method is preserved, and route stock is deducted exactly once.
3. **Given** insufficient stock for any line, **When** the sale is confirmed, **Then**
   the entire sale is rejected and no partial stock deduction or ticket is created.

---

### User Story 3 - Run and Reconcile a Delivery Route (Priority: P1)

An administrator creates and assigns a route from a branch. The administrator or
assigned driver records and confirms its load, the driver completes sales, and the
remaining physical products return to the branch so all quantities reconcile.

**Why this priority**: Driver stock leaves a fixed branch but remains business
inventory and must stay accountable throughout delivery activity.

**Independent Test**: Create a route from one branch, move it through Preparing, En
Route, Returned, and Closed, and verify that its stock starts and ends at zero with a
complete reconciliation.

**Acceptance Scenarios**:

1. **Given** a Preparing route with sufficient branch stock, **When** its administrator
   or assigned driver confirms the load, **Then** the quantities move from the branch
   into temporary route inventory.
2. **Given** a confirmed load, **When** the assigned driver starts the route, **Then**
   its state becomes En Route and loaded products become available for sale.
3. **Given** an En Route route, **When** the driver returns, **Then** its state becomes
   Returned and no additional sales can be confirmed.
4. **Given** physical return quantities, **When** the administrator reconciles the
   route, **Then** returned products move to the branch and differences require reasons.
5. **Given** a fully reconciled Returned route, **When** the administrator closes it,
   **Then** route inventory becomes zero and ordinary modification is blocked.

---

### User Story 4 - Manage Customers and Pricing (Priority: P2)

An administrator maintains customer records and per-product customer prices, while
drivers can find existing customers for their routes without changing protected data.

**Why this priority**: Customer history and accurate negotiated prices improve sale
speed and prevent unauthorized pricing changes.

**Independent Test**: Create and edit a customer, assign a special product price,
search for the customer, and verify the effective price and purchase history.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** a customer and a special price are created,
   **Then** both are available for subsequent sales.
2. **Given** a product without a customer-specific price, **When** it is selected for a
   customer, **Then** the current standard price is applied.
3. **Given** a driver, **When** the driver attempts to delete a customer or change a
   product price, **Then** the action is denied and no data changes.

---

### User Story 5 - Close Cash and Review Operations (Priority: P2)

An administrator reviews totals by category and overall, calculates the partner share
and remaining amount using the approved financial basis, and examines activity for a
day, week, or month.

**Why this priority**: Consistent closing and reporting let the business verify sales,
inventory, driver performance, popular products, and financial results.

**Independent Test**: Seed a known set of transactions, generate a cash close and each
reporting period, and compare every displayed result with the source records.

**Acceptance Scenarios**:

1. **Given** completed sales in multiple categories, **When** an administrator creates
   a cash close, **Then** category totals, the overall total, the 50 percent partner
   share, and the remaining amount reconcile exactly.
2. **Given** activity across multiple dates and drivers, **When** a day, week, or month
   is selected, **Then** only activity within that period contributes to the results.
3. **Given** completed activity, **When** an administrator reviews operations, **Then**
   sales by driver, best-selling products, inventory by branch, and the approved
   financial result are shown.

---

### User Story 6 - Save, Share, and Print Operational Documents (Priority: P3)

An authorized user generates portable copies of tickets, route loads, cash closes, and
reports and prints supported documents on a configured Bluetooth thermal printer.

**Why this priority**: Portable and printed records support customers and field
operations, but the underlying business transactions retain value without them.

**Independent Test**: Configure and test a printer, generate each supported document
from known records, save or share it where applicable, and simulate output failure.

**Acceptance Scenarios**:

1. **Given** an existing ticket, cash close, or report, **When** an authorized user
   requests a portable document, **Then** the output matches the stored source record
   and can be saved or shared.
2. **Given** a configured thermal printer, **When** an authorized user prints a
   supported document, **Then** the printed content matches its source record.
3. **Given** an unavailable printer or interrupted output, **When** printing fails,
   **Then** the user sees the failure, the business record remains committed exactly
   once, and output can be retried safely.

---

### User Story 7 - Administer Users and Operational Settings (Priority: P2)

An administrator creates and deactivates users, assigns Administrator or Driver roles,
and manages operational settings. A driver can configure and test only the printer
used for assigned work.

**Why this priority**: Controlled access and usable field printing are required before
multiple people can operate the system safely.

**Independent Test**: Create a driver, verify the driver's restricted access, configure
a printer as that driver, deactivate the account, and verify that access is revoked
without losing historical attribution.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** a user is created with the Driver role, **Then**
   the user receives driver permissions and cannot access administrator operations.
2. **Given** a driver, **When** the driver configures or tests an assigned printer,
   **Then** printer settings are available without exposing broader system settings.
3. **Given** a user referenced by history, **When** an administrator deactivates the
   account, **Then** future access is denied and historical attribution remains intact.

### Edge Cases

- Two users attempt to consume the last available units of the same stock concurrently.
- A user retries after losing confirmation of a sale, load, return, or adjustment.
- A customer-specific price is missing, inactive, or no longer valid.
- A user attempts to delete a product or customer referenced by historical activity.
- A returned quantity exceeds the quantity still assigned to the driver.
- A route load contains a product that becomes inactive before reconciliation.
- The physical return differs from the expected route balance.
- A user attempts a route-state transition out of sequence.
- A vehicle or driver is assigned to overlapping active routes.
- An administrator deactivates a driver who has an active route.
- A completed sale is cancelled after route inventory has already been returned.
- A quantity or price is zero, negative, malformed, or exceeds accepted business limits.
- The printer is disconnected, unsupported, out of paper, or fails partway through output.
- A reporting period crosses the configured business-day boundary.
- A driver attempts an administrator-only catalog, price, customer-deletion, or report action.
- A category is renamed after historical transactions have used it.
- Portable-document generation fails after the underlying business record is committed.

## Requirements *(mandatory)*

### Functional Requirements

#### Access and Permissions

- **FR-001**: The system MUST authenticate users before granting access to protected
  business information or operations.
- **FR-002**: The system MUST support Administrator and Driver roles and MUST evaluate
  authorization for every protected action.
- **FR-003**: Administrators MUST be able to maintain products, standard and
  customer-specific prices, customers, inventory, routes, cash closes, reports, users,
  printers, and operational settings.
- **FR-004**: Drivers MUST be limited to their assigned route, its load and returns,
  existing-customer selection, sales, their own history, and limited printer settings;
  they MUST NOT maintain products, prices, users, general inventory, or prior movements.

#### Products and Inventory

- **FR-005**: Administrators MUST be able to create, edit, search, activate, and
  deactivate products with a category, unit of sale, standard price, and low-stock
  threshold.
- **FR-006**: The system MUST maintain separate stock balances for each product at the
  initial branches Magdalena and Caborca and in each active route. A vehicle MUST NOT
  retain a permanent balance outside an active route.
- **FR-007**: Every stock change MUST create a movement containing the product,
  quantity, movement type, actor, time, reason, resulting balance, and related business
  record; source and destination MUST also be recorded for transfers.
- **FR-008**: Authorized users MUST be able to search and view inventory by product,
  branch, and route assignment according to their permissions.
- **FR-009**: A stock-changing operation MUST either complete in full with its movement
  records or make no changes, and it MUST NOT create a negative balance.
- **FR-039**: The system MUST support inventory Entry, Manual Exit, Transfer, Route
  Load, Sale, Route Return, Positive Adjustment, Negative Adjustment, and Sale
  Cancellation movements.
- **FR-040**: Administrators MUST see an inventory alert when an active product's branch
  balance is at or below its configured low-stock threshold.

#### Customers and Prices

- **FR-010**: Only administrators MUST be able to register or edit customers. Drivers
  MUST be able to search, view, and select existing customers for assigned routes but
  MUST NOT create or edit customer records.
- **FR-011**: Only administrators MUST be able to remove a customer from active use,
  and historical purchases MUST remain available afterward.
- **FR-012**: Administrators MUST be able to assign an effective customer-specific
  price for a product and later deactivate or replace that price.
- **FR-013**: The system MUST apply an active customer-specific price before the
  standard product price and MUST preserve the applied price on each completed sale.
- **FR-014**: Administrators MUST be able to view a customer's complete purchase
  history; drivers MUST see only customer information required for assigned sales.

#### Sales

- **FR-015**: A sale MUST identify an existing customer, responsible driver, active
  route, origin branch, items, quantities, applied unit prices, totals, payment method,
  and completion time.
- **FR-016**: Confirming a driver sale MUST record the sale, deduct stock only from the
  driver's active route, create the corresponding movements, and generate one ticket
  as a single business outcome.
- **FR-017**: The system MUST reject an entire sale when any requested quantity is
  unavailable and MUST explain which item prevented completion.
- **FR-018**: Repeating a sale confirmation after an uncertain response MUST NOT create
  a duplicate sale, ticket, or stock deduction.
- **FR-041**: Drivers MUST NOT edit an applied unit price during a sale.
- **FR-042**: Only administrators MUST be able to cancel a confirmed sale. Cancellation
  MUST preserve the original sale, record the actor and reason, and restore quantities
  through cancellation movements. Stock MUST return to the active route when that
  route can still receive movements; otherwise it MUST return to the route's origin
  branch without reopening or rewriting the route.
- **FR-043**: Each sale MUST record one payment method: Cash, Bank Transfer, or Card.
  The first release MUST NOT process electronic payments or create credit balances.

#### Routes, Loads, and Returns

- **FR-019**: Administrators MUST be able to create a route that identifies its origin
  branch, assigned driver, assigned vehicle, date, creator, and creation time.
- **FR-020**: While a route is Preparing, its administrator or assigned driver MUST be
  able to record and confirm the load. Confirmation MUST fail unless the full load can
  be transferred from the origin branch.
- **FR-021**: Authorized users MUST be able to see products originally loaded, sold,
  adjusted, expected back, physically returned, and still assigned to each route.
- **FR-022**: After a route is Returned, administrators MUST be able to record physical
  return quantities and move them to the origin branch in the same business operation.
- **FR-023**: A route MUST NOT close until every initial loaded quantity is reconciled
  as sold plus returned plus documented differences, and temporary route inventory is
  zero.
- **FR-024**: The system MUST retain load, departure, sale, return, difference,
  adjustment, and closing history for each route and driver.
- **FR-044**: A route MUST progress only through Preparing, En Route, Returned, and
  Closed, in that order. Starting requires a confirmed load; returning blocks further
  sales; closing requires full reconciliation.
- **FR-045**: A Closed route MUST reject ordinary edits. Any administrator correction
  MUST be a new traceable adjustment or reversal rather than a history rewrite.
- **FR-046**: The system MUST support multiple simultaneous active routes. Each active
  route MUST have one assigned driver and one assigned vehicle, and neither a driver
  nor a vehicle may be assigned to overlapping active routes.

#### Cash Closing and Reports

- **FR-025**: Administrators MUST be able to create a cash close showing totals for
  Sodas, Charcoal, Tostadas, other categories, and the overall total.
- **FR-026**: Each cash close MUST calculate the partner's share as 50 percent of gross
  sales and MUST calculate the remaining share as gross sales minus the partner share.
- **FR-027**: A saved cash close MUST preserve its contributing records, calculated
  values, rounding results, creator, and creation time so it can be reproduced.
- **FR-028**: Administrators MUST be able to review activity for a selected day, week,
  or month.
- **FR-029**: Reports MUST provide sales by driver, best-selling products, inventory by
  branch, gross sales, the partner share, and the remaining share.
- **FR-030**: Reporting periods MUST use one configured business timezone and consistent
  period boundaries.

#### Documents and Printing

- **FR-031**: Authorized users MUST be able to generate portable documents for tickets,
  cash closes, and reports that match their stored source records.
- **FR-032**: Users MUST be able to save or share each generated portable document.
- **FR-033**: Authorized users MUST be able to print tickets, route loads, cash closes,
  and receipts on a configured Bluetooth thermal printer.
- **FR-034**: Output failure MUST be shown to the user and MUST NOT reverse, duplicate,
  or alter a committed business record.
- **FR-035**: Users MUST be able to retry failed document generation or printing without
  repeating the underlying business operation.
- **FR-047**: Administrators MUST be able to configure available printers. Drivers MUST
  be able to select, connect, and test a printer without changing other system settings.

#### History and Corrections

- **FR-036**: Security-sensitive and business-critical changes MUST retain the actor,
  time, action, affected record, and relevant previous and new values.
- **FR-037**: Products, customers, categories, users, and other records referenced by
  history MUST be archived or deactivated rather than destructively deleted.
- **FR-038**: Corrections to completed business activity MUST use a traceable adjustment
  or reversal and MUST NOT silently overwrite the original record.

#### Users and Role-Specific Overview

- **FR-048**: Administrators MUST be able to create, edit, activate, deactivate, and
  assign Administrator or Driver roles to user accounts.
- **FR-049**: Deactivating a user MUST revoke future access without removing the user's
  attribution from historical records.
- **FR-050**: Each authenticated user MUST receive a concise operational overview
  limited to information and actions permitted for that user's role.

### Scope Boundaries

**In scope**:

- Browser access for administrators and drivers.
- Authentication and role-based permissions.
- Product, unit, customer, per-product pricing, inventory movement, sale, route, return,
  reconciliation, cash-close, reporting, user, and printer-setting workflows described
  above.
- Portable-document generation and Bluetooth thermal printing for the specified records.
- User-facing failure and retry behavior for critical operations and outputs.

**Out of scope**:

- Native mobile applications.
- Offline data entry and later synchronization.
- Route planning, GPS tracking, and vehicle telematics.
- Online ordering, customer self-service, and electronic payment processing.
- Credit sales, customer balances, accounts receivable, and payment collection.
- Product acquisition-cost tracking and accounting-profit calculations.
- Fiscal invoicing, tax filing, payroll, and general-ledger accounting.
- Integrations with external accounting, commerce, or logistics systems.
- Mandatory screen layouts, navigation structures, charts, and visual styling from the
  source document's illustrative examples.

### Key Entities

- **User**: An authenticated person with an Administrator or Driver role and an active
  or inactive status.
- **Role**: The permissions granted to an Administrator or Driver.
- **Location**: A fixed stock-holding branch, initially Magdalena or Caborca, identified
  by name and active status.
- **Product**: A sellable item with a stable identity, description, category, standard
  price, unit of sale, low-stock threshold, and active status.
- **Category**: A stable classification used to group products and cash-close totals.
- **Inventory Balance**: The current quantity of one product at a branch or in temporary
  inventory belonging to an active route.
- **Inventory Movement**: An immutable explanation of a quantity change, including
  type, quantity, actor, time, reason, balance, and related records.
- **Customer**: A buyer with identifying and contact information, city, active status,
  purchase history, and optional special prices.
- **Customer Price**: A time-bounded product price assigned to one customer.
- **Sale**: A completed business transaction linked to a customer, driver, active route,
  origin branch, line items, preserved prices, totals, payment method, movements, and
  ticket.
- **Sale Line**: A product, quantity, unit price, and calculated amount within a sale.
- **Ticket**: The customer-facing record generated from a completed sale.
- **Vehicle**: A named, active or inactive delivery vehicle that can belong to only one
  active route at a time.
- **Route**: A delivery lifecycle assigned to an origin branch, driver, and vehicle,
  with Preparing, En Route, Returned, or Closed state.
- **Route Line**: Loaded, sold, expected-return, physical-return, difference, adjusted,
  and remaining quantities for one product within a route.
- **Cash Close**: A preserved summary of category totals, overall total, partner share,
  remaining amount, contributing records, creator, and time.
- **Report**: A reproducible view of operational records for a selected period and
  reporting dimension.
- **Document Output**: A generated or printed representation linked to its source
  record, output type, status, attempts, and last failure when applicable.
- **Printer Setting**: An authorized user's selected thermal printer, connection state,
  and last test result.
- **Audit Event**: A record of a security-sensitive or business-critical change with
  actor, time, action, affected record, and before-and-after values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In reconciliation tests, 100 percent of completed stock-changing
  operations are explainable by movement history and reproduce the current balance.
- **SC-002**: No accepted concurrent or retried operation creates negative inventory or
  more than one business transaction for the same confirmation.
- **SC-003**: A trained user can complete a typical sale of up to 10 line items and
  obtain its ticket in under 2 minutes.
- **SC-004**: Every Closed route accounts for 100 percent of initial loaded quantities
  as sold, returned, or explicitly documented differences, with temporary route
  inventory equal to zero.
- **SC-005**: Cash-close and report values match their source records in 100 percent of
  acceptance-test samples, including boundary and rounding cases.
- **SC-006**: At least 95 percent of routine product, customer, and inventory searches
  show usable results within 2 seconds under expected operating conditions.
- **SC-007**: At least 95 percent of requested portable documents become available to
  save or share within 10 seconds under expected operating conditions.
- **SC-008**: Output failure tests produce zero lost or duplicated business records and
  allow a successful retry after the output dependency is restored.
- **SC-009**: At least 90 percent of representative administrators and drivers complete
  their primary workflow on the first attempt after basic training.
- **SC-010**: All tested attempts to perform an operation outside a user's role are
  denied without changing protected business data.
- **SC-011**: In route-state acceptance tests, 100 percent of invalid transitions and
  post-close ordinary edits are rejected without changing route or inventory history.
- **SC-012**: In cancellation acceptance tests, 100 percent of authorized sale
  cancellations preserve the original sale and restore each quantity exactly once.

## Assumptions

- Users have reliable network access while using the browser-based application;
  offline capture and synchronization are not required for the first release.
- The business operates as one organization with Magdalena and Caborca as the initial
  fixed stock-holding branches and may add or deactivate branches later without
  changing historical records.
- One configured business currency and one configured business timezone apply to the
  first release; currency conversion is not required.
- The partner share is 50 percent of gross sales. The remaining share is not presented
  as accounting profit, and acquisition costs are outside the first-release scope.
- Sales record Cash, Bank Transfer, or Card as information only; the system does not
  process payments or maintain customer credit balances.
- An active customer-specific price takes precedence over the current standard product
  price; otherwise the standard price applies.
- Inventory is not allowed to become negative.
- Route-held stock is temporary, is linked to its origin branch, and returns to zero
  when the route closes; a vehicle is not a permanent warehouse.
- Multiple routes may operate simultaneously, but an active driver or vehicle belongs
  to only one active route at a time.
- Every sale requires a selected customer; anonymous public sales are excluded unless
  this assumption is amended during clarification.
- Only administrators cancel sales, and cancellation restores inventory through
  traceable movements rather than deleting the sale.
- Tostadas remains a distinct cash-close category rather than being grouped into Other.
- Customer-specific prices are assigned per product, not per category.
- Product, customer, category, and user removal means archival when historical records
  refer to that data.
- Tickets and receipts are operational records, not government-authorized fiscal invoices.
- The business will provide compatible Bluetooth thermal-printer hardware for
  acceptance testing.
- Basic user training and production setup are delivery activities rather than
  additional product functionality.

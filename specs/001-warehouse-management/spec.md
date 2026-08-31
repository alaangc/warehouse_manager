# Feature Specification: Warehouse Management Operations

**Feature Branch**: Not created (feature directory: `001-warehouse-management`)

**Created**: 2026-08-14

**Last Updated**: 2026-08-26

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
- Q: Should a driver be able to record a sale when the buyer does not have an
  individual customer record? → A: No; every sale requires an individually registered
  customer.
- Q: Who should be allowed to cancel a confirmed sale? → A: Only administrators may
  cancel any confirmed sale.
- Q: Who should create and start a delivery route? → A: An administrator creates and
  assigns the route; the assigned driver records and confirms the load and starts it.
- Q: Who approves and closes a route when returned stock differs from the expected
  balance? → A: Only an administrator may document and approve the difference,
  provide a mandatory reason, create the corresponding adjustment, and close the
  route.

### Session 2026-08-20

- Q: Should “ticket” and “receipt” refer to the same customer-facing sale document?
  → A: Yes. They are the same document; use “sale ticket” as the canonical term and
  do not define a separate receipt type.
- Q: Under which operating load must the search and document response-time targets
  pass? → A: 25 concurrent users against data containing 10,000 products, 10,000
  customers, and 100,000 completed sales.
- Q: Which usability acceptance protocol should test first-attempt workflow completion
  and the two-minute sale target? → A: Test five administrators and five drivers after
  a standardized 15-minute introduction; each receives no assistance during one scored
  attempt.
- Q: Which historical records should a Driver be allowed to view? → A: Their own
  sales and every route assigned to them, including load, movement, reconciliation,
  and closure history; they cannot view another Driver's history.
- Q: Should route-load documents be available as portable files that users can save
  or share, in addition to being printable? → A: Yes. Route loads can be generated,
  saved, shared, and printed.
- Q: Should operational reports be limited to portable files, or should users also
  be able to print them on Bluetooth thermal printers? → A: Reports can be generated,
  saved, and shared, but cannot be printed on Bluetooth thermal printers.
- Q: Which exact workflows should participants perform during the first-attempt
  usability test? → A: Each Driver completes an exactly 10-line sale and obtains its
  sale ticket; each Administrator reconciles and closes a Returned route containing
  one documented inventory difference.

### Session 2026-08-21

- Q: What must be visible and functional before a search is considered to have
  produced usable results for the two-second target? → A: Loading has ended; matching
  rows or an explicit no-results state is visible; identifying fields and relevant
  values are rendered; available result actions are enabled.
- Q: At what route-load stage should users be allowed to generate, save, share, or
  print its document? → A: Only confirmed route loads can be generated, saved, shared,
  or printed; drafts remain editable and have no output document.
- Q: Which business documents should a Driver be allowed to generate, save, share, or
  print? → A: Drivers may access sale tickets for their own sales and confirmed route
  loads for routes assigned to them; cash closes and reports remain Administrator-only.
- Q: What should count as a failed first attempt during the usability test? → A: The
  attempt is one uninterrupted run; corrections before final submission are allowed,
  but a rejected final submission, restart, or assistance fails the attempt.

### Session 2026-08-26

- Q: How should day, week, and month reporting periods be bounded in the configured
  business timezone? → A: Days start at local midnight, weeks run Monday through
  Sunday, and months use calendar months; every period includes its start and excludes
  the next period's start.
- Q: When separate requests try to create a cash close for the same exact period, what
  should the system do? → A: Allow one current cash close per exact period. Retries
  reuse it, while a correction creates a linked superseding close without deleting the
  original.
- Q: Should authorized users be able to browse document records and their output-attempt
  history, or access documents only from the related source record? → A: Provide
  document lists and output-attempt history. Administrators see all; Drivers see only
  their own sale tickets and assigned confirmed-route-load documents.

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
receives the applicable prices, confirms the sale, and obtains a sale ticket while
route inventory is reduced exactly once.

**Why this priority**: Recording sales is the primary revenue-producing workflow and
must keep customer, price, sale ticket, and stock records aligned.

**Independent Test**: Using preconfigured customer, product, price, and stock data,
complete a sale and verify the stored sale, sale ticket, customer history, and stock
movement.

**Acceptance Scenarios**:

1. **Given** a customer with a special product price, **When** a driver adds that
   product to a sale, **Then** the special price is selected, cannot be edited by the
   driver, and is preserved on the sale.
2. **Given** sufficient stock in the driver's active route, **When** the driver confirms
   a sale with a payment method, **Then** one sale and one sale ticket are created, the
   payment method is preserved, and route stock is deducted exactly once.
3. **Given** insufficient stock for any line, **When** the sale is confirmed, **Then**
   the entire sale is rejected and no partial stock deduction or sale ticket is created.
4. **Given** no individually registered customer is selected, **When** the driver tries
   to confirm a sale, **Then** confirmation is rejected without creating a sale,
   sale ticket, or stock movement.
5. **Given** a confirmed sale, **When** a driver attempts to cancel it, **Then** the
   action is denied without changing the sale, inventory, or financial records.

---

### User Story 3 - Run and Reconcile a Delivery Route (Priority: P1)

An administrator creates and assigns a route from a branch. The assigned driver records
and confirms its load, starts the route, completes sales, and returns the remaining
physical products so all quantities reconcile.

**Why this priority**: Driver stock leaves a fixed branch but remains business
inventory and must stay accountable throughout delivery activity.

**Independent Test**: Create a route from one branch, move it through Preparing, En
Route, Returned, and Closed, and verify that its stock starts and ends at zero with a
complete reconciliation.

**Acceptance Scenarios**:

1. **Given** a Preparing route with sufficient branch stock, **When** its assigned
   driver confirms the load, **Then** the quantities move from the branch into
   temporary route inventory.
2. **Given** a confirmed load, **When** the assigned driver starts the route, **Then**
   its state becomes En Route and loaded products become available for sale.
3. **Given** an En Route route, **When** the driver returns, **Then** its state becomes
   Returned and no additional sales can be confirmed.
4. **Given** physical return quantities that differ from the expected balance,
   **When** an administrator reconciles the route, **Then** returned products move to
   the branch and the administrator must approve each difference with a reason and a
   corresponding adjustment movement.
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
4. **Given** a current cash close for an exact period, **When** the same request is
   retried or a correction is required, **Then** an identical retry returns the
   original result and an authorized correction creates one linked current close that
   supersedes but does not delete the original.

---

### User Story 6 - Save, Share, and Print Operational Documents (Priority: P3)

An authorized user generates portable copies of sale tickets, route loads, cash closes,
and reports and prints supported documents on a configured Bluetooth thermal printer.

**Why this priority**: Portable and printed records support customers and field
operations, but the underlying business transactions retain value without them.

**Independent Test**: Configure and test a printer, generate each supported document
from known records, save or share it where applicable, and simulate output failure.

**Acceptance Scenarios**:

1. **Given** an existing sale ticket, confirmed route load, cash close, or report,
   **When** an authorized user requests a portable document, **Then** the output
   matches the stored source record and can be saved or shared.
2. **Given** a configured thermal printer, **When** an authorized user prints a
   supported document, **Then** the printed content matches its source record.
3. **Given** an unavailable printer or interrupted output, **When** printing fails,
   **Then** the user sees the failure, the business record remains committed exactly
   once, and output can be retried safely.
4. **Given** a Driver, **When** the Driver requests a cash-close document, report
   document, another Driver's sale ticket, or a route-load document for an unassigned
   route, **Then** access is denied without creating or exposing the document.
5. **Given** document outputs and attempts belonging to multiple Drivers, **When** an
   authorized user browses document or output-attempt history, **Then** an Administrator
   sees all records and a Driver sees only sale-ticket records for their own sales and
   confirmed-route-load records for routes assigned to them.

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

---

### User Story 8 - Choose the Interface Language (Priority: P2)

An authenticated user selects English or Spanish from Settings and continues working
in the chosen language without losing the current page or entered data.

**Why this priority**: Administrators and drivers must be able to understand the same
operational workflows in their preferred language without maintaining separate
applications.

**Independent Test**: Open Settings, change from English to Spanish, verify that the
visible interface changes immediately, refresh the browser, and verify that Spanish
remains selected.

**Acceptance Scenarios**:

1. **Given** an authenticated user viewing the application in English, **When** the
   user selects Spanish, **Then** visible navigation, labels, actions, status text, and
   user-facing errors change to Spanish without a page refresh.
2. **Given** a user who selected Spanish, **When** the user refreshes or returns using
   the same browser, **Then** the application opens in Spanish.
3. **Given** either supported language, **When** dates, numbers, or monetary values are
   presented, **Then** their formatting follows the selected language while stored
   business values remain unchanged.

### Edge Cases

- Two users attempt to consume the last available units of the same stock concurrently.
- A user retries after losing confirmation of a sale, load, return, or adjustment.
- A customer-specific price is missing, inactive, or no longer valid.
- A user attempts to delete a product or customer referenced by historical activity.
- A returned quantity exceeds the quantity still assigned to the driver.
- A route load contains a product that becomes inactive before reconciliation.
- A user requests portable or printed output for a draft route load.
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
  existing-customer selection, sales, their own completed-sale history, the complete
  load, movement, reconciliation, and closure history of every route assigned to them,
  sale-ticket documents for their own sales, confirmed-route-load documents for their
  assigned routes, and limited printer settings. Drivers MUST NOT view another Driver's
  history or documents, access cash-close or report documents, or maintain products,
  prices, users, general inventory, or unrelated movements. Document and output-attempt
  history lists, filters, and direct-record access MUST enforce these same source-based
  restrictions.

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

- **FR-015**: A sale MUST identify an active, individually registered customer,
  responsible driver, active route, origin branch, items, quantities, applied unit
  prices, totals, payment method, and completion time. Anonymous or shared-public
  customer sales MUST NOT be accepted.
- **FR-016**: Confirming a driver sale MUST record the sale, deduct stock only from the
  driver's active route, create the corresponding movements, and generate one sale ticket
  as a single business outcome.
- **FR-017**: The system MUST reject an entire sale when any requested quantity is
  unavailable and MUST explain which item prevented completion.
- **FR-018**: Repeating a sale confirmation after an uncertain response MUST NOT create
  a duplicate sale, sale ticket, or stock deduction.
- **FR-041**: Drivers MUST NOT edit an applied unit price during a sale.
- **FR-042**: Only administrators MUST be able to cancel a confirmed sale. Cancellation
  MUST preserve the original sale, record the actor and reason, and restore quantities
  through cancellation movements. Stock MUST return to the active route when that
  route can still receive movements; otherwise it MUST return to the route's origin
  branch without reopening or rewriting the route.
- **FR-043**: Each sale MUST record one payment method: Cash, Bank Transfer, or Card.
  The first release MUST NOT process electronic payments or create credit balances.

#### Routes, Loads, and Returns

- **FR-019**: Only administrators MUST be able to create and assign a route. Each route
  MUST identify its origin branch, assigned driver, assigned vehicle, date, creator,
  and creation time.
- **FR-020**: While a route is Preparing, only its assigned driver MUST be able to
  record and confirm the load. Confirmation MUST fail unless the full load can be
  transferred from the origin branch.
- **FR-021**: Authorized users MUST be able to see products originally loaded, sold,
  adjusted, expected back, physically returned, and still assigned to each route.
- **FR-022**: After a route is Returned, administrators MUST be able to record physical
  return quantities and move them to the origin branch in the same business operation.
- **FR-023**: A route MUST NOT close until every initial loaded quantity is reconciled
  as sold plus returned plus documented differences, and temporary route inventory is
  zero. Only an administrator MUST be able to approve a difference or close a route.
  Each approved difference MUST include a mandatory reason and create the corresponding
  positive or negative adjustment movement before closure.
- **FR-024**: The system MUST retain load, departure, sale, return, difference,
  adjustment, and closing history for each route and Driver. Administrators MUST be
  able to view all such history; Drivers MUST be able to view it only for routes
  assigned to them.
- **FR-044**: A route MUST progress only through Preparing, En Route, Returned, and
  Closed, in that order. Only the assigned driver may start a route with a confirmed
  load; returning blocks further sales; closing requires full reconciliation.
- **FR-045**: A Closed route MUST reject ordinary edits. Any administrator correction
  MUST be a new traceable adjustment or reversal rather than a history rewrite.
- **FR-046**: The system MUST support multiple simultaneous active routes. Each active
  route MUST have one assigned driver and one assigned vehicle, and neither a driver
  nor a vehicle may be assigned to overlapping active routes.

#### Cash Closing and Reports

- **FR-025**: Administrators MUST be able to create a cash close showing totals for
  Sodas, Charcoal, Tostadas, other categories, and the overall total. Only one cash
  close MUST be current for an exact start/end period. An identical idempotent retry
  MUST return the original close, while a separate create request for a period that
  already has a current close MUST be rejected as a conflict unless it is an authorized
  correction.
- **FR-026**: Each cash close MUST calculate the partner's share as 50 percent of gross
  sales and MUST calculate the remaining share as gross sales minus the partner share.
- **FR-027**: A saved cash close MUST preserve its contributing records, calculated
  values, rounding results, creator, and creation time so it can be reproduced. An
  authorized correction MUST create a new immutable close linked to the close it
  supersedes and MUST atomically make the new close current without deleting or
  rewriting any prior close.
- **FR-028**: Administrators MUST be able to review activity for a selected day, week,
  or month.
- **FR-029**: Reports MUST provide sales by driver, best-selling products, inventory by
  branch, gross sales, the partner share, and the remaining share.
- **FR-030**: Reporting periods MUST use the configured business timezone. A day MUST
  start at local midnight and end at the next local midnight; a week MUST start Monday
  at local midnight and end the next Monday at local midnight; and a month MUST start
  on its first day at local midnight and end on the first day of the next month at
  local midnight. Every period MUST include its start and exclude its end.

#### Documents and Printing

- **FR-031**: Authorized users MUST be able to generate portable documents for sale
  tickets, confirmed route loads, cash closes, and reports that match their stored
  source records. Administrators MUST be able to generate all four types. Drivers MUST
  be limited to sale tickets for their own sales and confirmed route loads for routes
  assigned to them. Draft route loads MUST NOT produce an output document. Authorized
  users MUST be able to list and retrieve document records and their output-attempt
  history under the same source-based rules: Administrators may access all records,
  while Drivers may access only their own sale-ticket records and assigned confirmed-
  route-load records. User-supplied filters or direct identifiers MUST NOT broaden
  access or expose unauthorized metadata.
- **FR-032**: Users MUST be able to save or share each generated portable document.
- **FR-033**: Authorized users MUST be able to print sale tickets, confirmed route
  loads, and cash closes on a configured Bluetooth thermal printer. Administrators MUST
  be able to print all three types. Drivers MUST be limited to sale tickets for their
  own sales and confirmed route loads for routes assigned to them. Draft route loads
  and reports MUST NOT be eligible for Bluetooth thermal printing.
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

#### Interface Language

- **FR-051**: Every authenticated user MUST be able to select English or Spanish from
  Settings, and the selected language MUST take effect without a page refresh or loss
  of in-progress page state.
- **FR-052**: The selected language MUST persist for subsequent visits from the same
  browser. Spanish MUST be used when no prior preference exists.
- **FR-053**: Navigation, headings, field labels, actions, statuses, validation
  guidance, user-facing failures, dates, numbers, and monetary presentation MUST use
  the selected language. User-entered and historical business data MUST NOT be
  translated or modified when the interface language changes.

### Scope Boundaries

**In scope**:

- Browser access for administrators and drivers.
- Authentication and role-based permissions.
- Product, unit, customer, per-product pricing, inventory movement, sale, route, return,
  reconciliation, cash-close, reporting, user, and printer-setting workflows described
  above.
- Portable-document generation and Bluetooth thermal printing for the specified records.
- User-facing failure and retry behavior for critical operations and outputs.
- English and Spanish interface text with a browser-persisted user preference.

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
  sale ticket.
- **Sale Line**: A product, quantity, unit price, and calculated amount within a sale.
- **Sale Ticket**: The customer-facing record generated from a completed sale.
- **Vehicle**: A named, active or inactive delivery vehicle that can belong to only one
  active route at a time.
- **Route**: A delivery lifecycle assigned to an origin branch, driver, and vehicle,
  with Preparing, En Route, Returned, or Closed state.
- **Route Line**: Loaded, sold, expected-return, physical-return, difference, adjusted,
  and remaining quantities for one product within a route.
- **Cash Close**: A preserved summary of category totals, overall total, partner share,
  remaining amount, contributing records, creator, time, current/superseded state, and
  optional link to the prior close it supersedes.
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
- **SC-003**: After the standardized 15-minute introduction, each of the five Driver
  participants MUST complete one typical sale of exactly 10 line items and obtain its
  sale ticket in under 2 minutes without assistance.
- **SC-004**: Every Closed route accounts for 100 percent of initial loaded quantities
  as sold, returned, or explicitly documented differences, with temporary route
  inventory equal to zero.
- **SC-005**: Cash-close and report values match their source records in 100 percent of
  acceptance-test samples, including boundary and rounding cases.
- **SC-006**: During an acceptance workload with 25 concurrent users and data containing
  10,000 products, 10,000 customers, and 100,000 completed sales, at least 95 percent
  of routine product, customer, and inventory searches MUST, within 2 seconds, finish
  loading and show either matching rows or an explicit no-results state. Identifying
  fields and relevant values MUST be rendered, and every result action available to
  the user MUST be enabled before the search is counted as complete.
- **SC-007**: During the same acceptance workload defined in SC-006, at least 95 percent
  of requested portable documents MUST become available to save or share within 10
  seconds.
- **SC-008**: Output failure tests produce zero lost or duplicated business records and
  allow a successful retry after the output dependency is restored.
- **SC-009**: After the standardized 15-minute introduction, at least 9 of the 10
  participants—five Administrators and five Drivers—MUST complete their assigned
  workflow on the first attempt without assistance. Each Driver's assigned workflow
  is the exactly 10-line sale and sale-ticket workflow defined in SC-003. Each
  Administrator's assigned workflow is to reconcile and close a Returned route that
  contains one documented inventory difference. A first attempt MUST be one
  uninterrupted run. Participants MAY correct inputs before final submission, but a
  rejected final submission, restart, or any assistance MUST count as a failed attempt.
- **SC-010**: All tested attempts to perform an operation outside a user's role are
  denied without changing protected business data.
- **SC-011**: In route-state acceptance tests, 100 percent of invalid transitions and
  post-close ordinary edits are rejected without changing route or inventory history.
- **SC-012**: In cancellation acceptance tests, 100 percent of authorized sale
  cancellations preserve the original sale and restore each quantity exactly once.
- **SC-013**: In bilingual acceptance tests, 100 percent of reviewed implemented pages
  change their visible interface text immediately after language selection, preserve
  entered form values, and retain the selection after a browser refresh.

## Assumptions

- Users have reliable network access while using the browser-based application;
  offline capture and synchronization are not required for the first release.
- Language preference is local to a browser rather than synchronized between a user's
  devices. Spanish is the default when that browser has no saved preference.
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
- Tostadas remains a distinct cash-close category rather than being grouped into Other.
- Customer-specific prices are assigned per product, not per category.
- Product, customer, category, and user removal means archival when historical records
  refer to that data.
- Sale tickets are operational records, not government-authorized fiscal invoices.
- The business will provide compatible Bluetooth thermal-printer hardware for
  acceptance testing.
- Basic user training and production setup are delivery activities rather than
  additional product functionality.

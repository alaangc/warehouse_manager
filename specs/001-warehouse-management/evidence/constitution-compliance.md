# T145: Requirement traceability and constitution review

Reviewed 2026-09-18 (America/Hermosillo) by Codex, automated code/evidence reviewer.
Initial baseline: `5f62c81` on `main`. Constitution: **3.0.0**.

T150 update (2026-09-18): findings **A1–A4 are closed** by the added audit tests
and customer snapshot correction in this commit, based on `62d6ea4`. See
[T150 execution evidence](t150-audit-coverage.md). B1/C1 and physical/human acceptance
remain open. The traceability/audit matrix below reflects this update; the original
review is retained in Git history.

**Release disposition: HOLD — approval withheld.** This is a completed review record,
not a claim that T145 or the feature is complete. Physical acceptance T133, human
acceptance/accessibility T141, the complete acceptance portion of T144, and the
findings below remain open. No human reviewer signature or exception approval is
implied by this record or by committing it.

## Method and evidence boundary

Compared the [specification](../spec.md), [plan](../plan.md),
[audit matrix](../data-model.md#audit-coverage-and-atomicity),
[tasks](../tasks.md), [contract](../contracts/README.md), service transaction
boundaries, and concrete test assertions. The requirements checklist has 16 checked
items and zero unchecked items. The prerequisite script resolved this feature and
its research, data model, contracts, quickstart and tasks. No extension hooks exist.

The [T144 record](quickstart-results.md) and [machine-readable results](quickstart-results.json)
are the execution baseline: 348 unit/component, 144 HTTP and 212 integration tests
passed; browser coverage combines the initial full run with the corrected customer
walkthrough, with two expected BLE skips. Search passed 432/450 actions within two
seconds; documents passed 400/400 within ten seconds. Migration and recovery drills
passed. Those are retained local results, not a new test run or hosted-CI result.
The initial T145 review changed documentation only. T150 adds tests and corrects
customer audit snapshots; its focused execution results supplement the T144 baseline.

Documentation verification: exactly one traceability row for each of the 53 FRs
and 13 SCs; all reference definitions and local link targets resolve;
152 task IDs are unique; `git diff --check` passes. Existing bilingual tasks
T146–T149 retain their completed status; remediation uses new IDs T150–T152.

In the tables, **covered** means implementation and relevant automated assertions
were identified, within the stated test scope. It does not certify every possible
input or operational environment. **Partial** identifies a specific missing proof.
**Pending** requires acceptance evidence that does not exist yet. Source and test
links resolve relative to this file; test descriptions in the audit table identify
the assertions to inspect rather than relying on filenames alone.

## Functional requirement traceability

| Requirement | Implementation | Verification and review result |
| --- | --- | --- |
| FR-001 Authentication | [Auth service][auth], [authorization][authorization] | [Auth HTTP tests][auth-tests]; unauthenticated denial, login/session/logout: covered. |
| FR-002 Administrator/Driver authorization | [Authorization][authorization], module routers | [Auth HTTP tests][auth-tests], [route authorization][route-auth], [document authorization][document-auth]: covered. |
| FR-003 Administrator maintenance | [Catalog][catalog], [customers][customers], [users][users], [settings][settings], [printers][printers], [reporting][reports], [route loads][loads] | [Inventory HTTP][inventory-http], [customer HTTP][customer-http], [administration HTTP][admin-http], [report HTTP][report-http], [route HTTP][route-http]; audit gaps A1–A3 closed by T150. |
| FR-004 Driver source/history scope | [Route repository][route-repo], [sale repository][sale-repo], [document repository][documents-repo] | [Route authorization][route-auth], [sales HTTP][sales-http], [document history][document-history], [document authorization][document-auth]: covered, including filters/cursors/direct IDs. |
| FR-005 Product lifecycle, prices, thresholds | [Catalog][catalog], [catalog UI][catalog-ui] | [Inventory ledger][ledger], [inventory HTTP][inventory-http], [catalog UI tests][catalog-ui-tests]: behavior covered; audit evidence completed by T150 (A1). |
| FR-006 Branch and temporary-route stock | [Inventory repository][inventory-repo], [route loads][loads], [catalog migration][catalog-migration] | [Database integration][db-tests], [route lifecycle][route-tests]: covered. |
| FR-007 Traceable stock movements | [Inventory service][inventory], [inventory repository][inventory-repo] | [Inventory ledger][ledger], [route lifecycle][route-tests], [sale confirmation][sale-tests]: covered movement linkage/balances; audit-path evidence completed by T150 (A3). |
| FR-008 Inventory search and scope | [Inventory router][inventory-router], [inventory UI][inventory-ui] | [Inventory search HTTP][search-http], [inventory E2E][inventory-e2e]: covered. |
| FR-009 Atomic nonnegative stock | [Serializable runner][transactions], [inventory service][inventory], [catalog migration][catalog-migration] | [Inventory concurrency][inventory-concurrency], [inventory ledger][ledger], [sale confirmation][sale-tests]: covered rollback/constraints/concurrency. |
| FR-010 Customer mutation versus selection | [Customer router][customer-router], [customers][customers] | [Customer HTTP][customer-http], [customer pricing][customer-tests]: covered allowed/denied writes. |
| FR-011 Customer archive/history | [Customers][customers], [customer repository][customer-repo] | [Customer pricing][customer-tests], [customer E2E][customer-e2e]: behavior covered; archive audit-failure proof completed by T150 (A2). |
| FR-012 Effective customer-specific prices | [Customer prices][prices], [sales migration][sales-migration] | [Customer pricing][customer-tests], [price exclusion constraint][price-constraint]: covered create/deactivate/replacement and overlap rejection. |
| FR-013 Price precedence and historical snapshot | [Pricing service][pricing], [sale service][sales] | [Pricing unit tests][pricing-tests], [customer pricing][customer-tests], [customer E2E][customer-e2e]: covered. |
| FR-014 Customer purchase history | [Customer repository][customer-repo], [customer UI][customer-ui] | [Customer HTTP][customer-http], [customer E2E][customer-e2e]: covered Administrator history and Driver denial. |
| FR-015 Complete named-customer sale | [Sale service][sales], [sales contracts][sales-schemas] | [Sale confirmation][sale-tests], [sales HTTP][sales-http]: covered required fields, active customer, exact snapshots. |
| FR-016 One sale/route deduction/ticket outcome | [Sale service][sales] | [Sale confirmation][sale-tests], [sales E2E][sales-e2e]: covered atomic business records; portable rendering is a subsequent output operation. |
| FR-017 Whole-sale stock rejection | [Sale service][sales], [inventory repository][inventory-repo] | [Sale confirmation][sale-tests], [sales HTTP][sales-http]: covered unavailable item and no partial sale. |
| FR-018 Retry-safe sale confirmation | [Sale service][sales], [idempotency][idempotency] | [Sale confirmation][sale-tests]: replay, changed key content and concurrent confirmation covered. |
| FR-019 Administrator route assignment | [Route loads][loads], [route router][route-router] | [Route HTTP][route-http], [route lifecycle][route-tests]: covered. |
| FR-020 Assigned Driver confirms Preparing load | [Route loads][loads] | [Route authorization][route-auth], [route lifecycle][route-tests]: covered all-or-nothing multi-product transfer. |
| FR-021 Route quantity projections | [Route projection][route-projection], [route overview UI][route-ui] | [Route domain][route-domain-tests], [route lifecycle][route-tests], [route E2E][route-e2e]: covered. |
| FR-022 Physical returns and branch transfer | [Reconciliation][reconciliation] | [Route lifecycle][route-tests]: covered return balances/movements and audit-failure rollback. |
| FR-023 Reconciliation, differences and zero-stock close | [Reconciliation][reconciliation] | [Route lifecycle][route-tests], [route E2E][route-e2e]: covered both difference signs, mandatory reasons and closure guards. |
| FR-024 Route/Driver immutable scoped history | [Route router][route-router], [route repository][route-repo] | [Route authorization][route-auth], [route lifecycle][route-tests], [route E2E][route-e2e]: covered. |
| FR-025 One current cash close per exact period | [Cash-close service][cash-close], [reporting migration][report-migration] | [Cash-close currentness][currentness], [cash-close service tests][cash-service-tests], [report HTTP][report-http]: covered create/replay/conflicting create. |
| FR-026 Exact 50% gross partner share | [Financial calculations][finance], [money][money] | [Financial unit tests][finance-tests], [money unit tests][money-tests], [cash-close reporting][cash-report-tests]: covered explicit rounding. |
| FR-027 Immutable close and linked correction | [Cash-close service][cash-close], [cash-close repository][cash-repo] | [Cash-close service tests][cash-service-tests], [cash-close reporting][cash-report-tests], [currentness][currentness]: covered snapshot, pointer replacement, race and rollback. |
| FR-028 Day/week/month activity | [Reporting periods][periods], [reporting UI][report-ui] | [Reporting period tests][period-tests], [report HTTP][report-http], [report E2E][report-e2e]: covered. |
| FR-029 Driver/product/inventory/financial reports | [Report service][reports], [report repository][report-repo] | [Report repository tests][report-tests], [report HTTP][report-http], [report E2E][report-e2e]: covered report types and stored-source totals. |
| FR-030 Timezone, Monday weeks, half-open periods | [Reporting periods][periods] | [Reporting period tests][period-tests], [report repository tests][report-tests]: covered DST/local midnight and `[start,end)`. |
| FR-031 Canonical portable documents and scoped history | [Document service][documents], [document repository][documents-repo], [PDF renderers][pdf] | [Document HTTP][document-http], [document history][document-history], [document authorization][document-auth], [PDF tests][pdf-tests]: covered four sources, draft denial and scoped access. |
| FR-032 Save/share documents | [Document actions UI][document-actions] | [Document action tests][document-action-tests], [document E2E][document-e2e]: download/share/fallback software paths covered; real OS sharing destination acceptance not established by mocks. |
| FR-033 Bluetooth thermal output | [Print dialog][print-dialog], [BLE adapter][ble], [ESC/POS formatter][escpos] | [Printer tests][printer-tests], [document E2E][document-e2e]; **pending T133 physical acceptance**, software allow/deny paths covered. |
| FR-034 Output failure isolation | [Document service][documents], [print dialog][print-dialog] | [Document output integration][document-output], [document service tests][document-service-tests], [document E2E][document-e2e]: covered source preservation and visible failure. |
| FR-035 Output retry independent of business operation | [Document service][documents], [print dialog][print-dialog] | [Document retry HTTP][retry-http], [document output integration][document-output], [document E2E][document-e2e]: covered canonical reuse/retry and uncertain print acknowledgement. |
| FR-036 Actor/time/action/before-after audit | [Audit writer][audit], [audit types][audit-types], module services | Audit matrix below: A1–A4 closed by T150; release-level acceptance remains open. |
| FR-037 Archive rather than destructive history deletion | [Catalog][catalog], [customers][customers], [users][users], migrations | [Inventory ledger][ledger], [customer pricing][customer-tests], [user settings][admin-tests], [printer settings][printer-service-tests]: covered representative history/FK/archive behavior; catalog/customer audit variants completed by T150. |
| FR-038 Traceable corrections | [Inventory reversal][inventory], [sale cancellation][cancellation], [cash-close correction][cash-close] | [Inventory ledger][ledger], [sale cancellation tests][cancel-tests], [cash-close service tests][cash-service-tests]: covered correction records; reversal audit-failure proof completed by T150 (A3). |
| FR-039 Required movement kinds | [Inventory service][inventory], [route loads][loads], [reconciliation][reconciliation], [sales][sales], [cancellation][cancellation] | [Database integration][db-tests], [inventory ledger][ledger], [route lifecycle][route-tests], [sale tests][sale-tests], [cancellation tests][cancel-tests]: covered movement behavior; T150 supplies the missing per-kind audit proof. |
| FR-040 Active-product branch low-stock alerts | [Inventory repository][inventory-repo], [overview service][overview], [inventory UI][inventory-ui] | [Inventory search HTTP][search-http], [overview tests][overview-tests], [inventory E2E][inventory-e2e]: covered threshold and role scope. |
| FR-041 Driver cannot override unit price | [Pricing][pricing], [sales contracts][sales-schemas] | [Pricing unit tests][pricing-tests], [sales HTTP][sales-http], [sales E2E][sales-e2e]: covered server-authored prices and forbidden override. |
| FR-042 Administrator cancellation, restore once | [Cancellation][cancellation] | [Cancellation tests][cancel-tests], [sales HTTP][sales-http]: covered active route versus Returned/Closed origin branch, reason, immutable original and duplicate rejection. |
| FR-043 Cash/transfer/card classification only | [Sales contracts][sales-schemas], [sale service][sales] | [Sales HTTP][sales-http], [sale confirmation][sale-tests], [cash-close reporting][cash-report-tests]: payment classification covered; no payment processor is part of this workflow. |
| FR-044 Ordered route state transitions | [Route domain][route-domain], [transitions][transitions], [reconciliation][reconciliation] | [Route domain tests][route-domain-tests], [route lifecycle][route-tests], [route authorization][route-auth]: covered invalid transitions and sales after return. |
| FR-045 Closed-route ordinary edits rejected | [Route domain][route-domain], [reconciliation][reconciliation], [inventory][inventory], [cancellation][cancellation] | [Route lifecycle][route-tests], [cancellation tests][cancel-tests]: covered immutable closed route and linked cancellation. Generic inventory reversal audit proof is recorded in T150; no generic route-history rewrite endpoint is claimed. |
| FR-046 Concurrent routes, exclusive active assignments | [Route repository][route-repo], [route migration][route-migration] | [Route lifecycle][route-tests], [user settings][admin-tests]: covered competing assignments and assigned-user/vehicle changes. |
| FR-047 Printer administration and limited Driver controls | [Printer settings service][printers], [printer preference UI][printer-ui] | [Printer service tests][printer-service-tests], [administration E2E][admin-e2e], [printer UI tests][printer-ui-tests]: software covered; real connect/test pending T133. |
| FR-048 User lifecycle and roles | [User administration][users] | [User settings][admin-tests], [administration HTTP][admin-http], [administration E2E][admin-e2e]: covered. |
| FR-049 Deactivation revokes access, preserves attribution | [User administration][users], [authorization][authorization] | [User settings][admin-tests], [administration E2E][admin-e2e]: covered sessions, immutable historical actor and active-assignment restrictions. |
| FR-050 Role-limited operational overview | [Overview service][overview], [overview UI][overview-ui] | [Overview integration][overview-tests], [overview UI tests][overview-ui-tests]: covered Administrator versus assigned Driver response/UI. |

The current spec also contains requirements beyond T145's original FR-001–FR-050
range. Omitting them would understate the release scope:

| Requirement | Implementation | Verification and review result |
| --- | --- | --- |
| FR-051 Reactive language choice without losing edits | [i18n][i18n], [language settings UI][language-ui] | [Language component tests][language-tests], [administration UI tests][admin-ui-tests], [printer preference tests][printer-preference-tests]: representative forms covered; page inventory acceptance partial (B1). |
| FR-052 Persist preference, Spanish default | [i18n][i18n] | [Language tests][language-tests] assert storage write; initialization reads validated `en`/`es` with Spanish fallback. Explicit fresh-browser/invalid-storage/reload acceptance is missing (B1). |
| FR-053 Localized interface and unchanged business data | [i18n][i18n], feature translations/presentation | Representative form preservation covered by [language tests][language-tests]; complete reviewed-page text/format/error/data acceptance is missing (B1). |

## Success criteria

| Criterion | Code/test/evidence chain | Disposition |
| --- | --- | --- |
| SC-001 Ledger reproduces balances | [Inventory service][inventory] → [ledger assertions][ledger-assertions], [inventory ledger][ledger], [route lifecycle][route-tests] → [T144](quickstart-results.md) | Covered tested operations. |
| SC-002 No negative/duplicate concurrent or retried operation | [Transactions][transactions], [idempotency][idempotency] → [inventory concurrency][inventory-concurrency], [sale confirmation][sale-tests], [route lifecycle][route-tests], [cash-close currentness][currentness] | Covered tested races/retries. |
| SC-003 Five Drivers, exactly ten lines, under two minutes | [Sale form][sale-ui], [document actions][document-actions] → [frozen protocol](usability.md) | **Pending**, no participant timings. |
| SC-004 Closed route fully reconciled and zero | [Reconciliation][reconciliation] → [route lifecycle][route-tests], [route E2E][route-e2e] | Covered tested quantities and difference signs. |
| SC-005 Cash/report values match source | [Reporting][reports], [cash close][cash-close], [money][money] → [financial tests][finance-tests], [cash reporting][cash-report-tests], [report repositories][report-tests] | Covered tested rounding/boundaries/source snapshots. |
| SC-006 95% complete visible searches within two seconds | [Inventory UI][inventory-ui], [customer UI][customer-ui] → [search profile][search-profile] → [T144 performance](quickstart-results.md#performance-verification) | Passed aggregate 432/450 (96%); customer no-results subgroup 71/75 is retained, not independently claimed as 95%. |
| SC-007 95% portable outputs within ten seconds | [Document service][documents], [PDF renderers][pdf] → [document profile][document-profile] → [T144 performance](quickstart-results.md#performance-verification) | Passed 400/400; p95 5389.9 ms, 25 users and required data scale. |
| SC-008 Output failure loses/duplicates zero business records | [Documents][documents] → [document output tests][document-output], [document service tests][document-service-tests], [document E2E][document-e2e] | Software failure/retry covered; physical output remains T133. |
| SC-009 Nine of ten first-attempt successes | [Sale UI][sale-ui], [reconciliation UI][reconciliation-ui] → [usability protocol](usability.md) | **Pending**, no participant scores. |
| SC-010 Tested out-of-role attempts denied without mutation | [Authorization][authorization], scoped services → [route authorization][route-auth], [document authorization][document-auth], [customer tests][customer-tests], [admin tests][admin-tests] | Covered tested roles/source IDs/history filters. |
| SC-011 Invalid route transitions/closed edits rejected | [Route domain][route-domain] → [route domain tests][route-domain-tests], [route lifecycle][route-tests] | Covered tested transition matrix and unchanged history. |
| SC-012 Cancellation preserves original/restores once | [Cancellation][cancellation] → [cancellation tests][cancel-tests] | Covered allowed/denied states, duplicate request and rollback. |
| SC-013 Immediate bilingual pages, preserved inputs, refresh persistence | [i18n][i18n] → [language tests][language-tests], [administration UI tests][admin-ui-tests] | **Partial B1**: representative component assertions do not prove the complete browser acceptance criterion. |

## Mutation-to-audit evidence

All five mutation classes from the data model are expanded below. **TX** means
the service passes the same transaction to the business writes and `AuditWriter`;
presence plus injected audit failure/rollback tests support that code inspection.
User/settings/printer tests additionally compare PostgreSQL `xmin` transaction IDs.
An `xmin` assertion is not imposed as a new universal requirement. **Partial** means
the existing test cannot be generalized to all listed mutations merely because they
share a helper. Failure tests must also exclude a success audit for the rejected write.

| Mutation and audit action | Same-transaction presence | Failure rollback evidence | Result |
| --- | --- | --- | --- |
| User create/edit/activate/deactivate/role/password; `USER_*` | [User service][users]; [user settings][admin-tests] `creates an Argon2id user…`, `it.each(changes)` and `expectAudit` compare row/audit `xmin`, safe snapshots and actor. | Same suite `rolls back user creation…` and parameterized changes inject DB audit failure, assert data/session preservation and no success audit. | Covered. |
| Privilege/deactivation session revocation; parent `USER_UPDATED` / `USER_DEACTIVATED` event | [User service][users] revokes inside user transaction; [user settings][admin-tests] compare session/user `xmin`, revocation reason and parent user event. There is no separate session-revocation audit action. | Same parameterized audit-failure tests retain sessions and prevent successful mutation. | Covered transactional session effects; parent event represents the change. |
| Product create/edit/archive/reactivate; `CATALOG_CHANGED` | [Catalog][catalog] TX; [ledger][ledger] `T150 audits and rolls back $kind $action` asserts each successful lifecycle event, actor/reason, safe before/after state and matching transaction IDs. | The same parameterized case proves the audit trigger was reached, then compares all catalog, derived stock-location and audit rows before/after rejection. See [T150 evidence](t150-audit-coverage.md). | Covered by T150: 4 lifecycle cases, full-row rollback and business/audit transaction identity. |
| Category create/edit/archive/reactivate; `CATALOG_CHANGED` | [Catalog][catalog] TX; [ledger][ledger] `T150 audits and rolls back $kind $action` asserts each successful lifecycle event, actor/reason, safe before/after state and matching transaction IDs. | The same parameterized case proves the audit trigger was reached, then compares all catalog, derived stock-location and audit rows before/after rejection. See [T150 evidence](t150-audit-coverage.md). | Covered by T150: 4 lifecycle cases, full-row rollback and business/audit transaction identity. |
| Unit create/edit/archive/reactivate; `CATALOG_CHANGED` | [Catalog][catalog] TX; [ledger][ledger] `T150 audits and rolls back $kind $action` asserts each successful lifecycle event, actor/reason, safe before/after state and matching transaction IDs. | The same parameterized case proves the audit trigger was reached, then compares all catalog, derived stock-location and audit rows before/after rejection. See [T150 evidence](t150-audit-coverage.md). | Covered by T150: 4 lifecycle cases, full-row rollback and business/audit transaction identity. |
| Location create/edit/archive/reactivate, derived stock location; `CATALOG_CHANGED` | [Catalog][catalog] TX; [ledger][ledger] `T150 audits and rolls back $kind $action` asserts each successful lifecycle event, actor/reason, safe before/after state and matching transaction IDs. | The same parameterized case proves the audit trigger was reached, then compares all catalog, derived stock-location and audit rows before/after rejection. See [T150 evidence](t150-audit-coverage.md). | Covered by T150: 4 lifecycle cases, derived stock-location rollback and creation transaction identity. |
| Vehicle create/edit/archive/reactivate; `CATALOG_CHANGED` | [Catalog][catalog] TX; [ledger][ledger] `T150 audits and rolls back $kind $action` asserts each successful lifecycle event, actor/reason, safe before/after state and matching transaction IDs. | The same parameterized case proves the audit trigger was reached, then compares all catalog, derived stock-location and audit rows before/after rejection. See [T150 evidence](t150-audit-coverage.md). | Covered by T150: 4 permitted lifecycle cases, full-row rollback and transaction identity. |
| Customer create/edit/archive/reactivate; `CATALOG_CHANGED` | [Customer service][customers] TX; existing create event test plus [customer pricing][customer-tests] `T150 audits and rolls back customer %s…` assert full editable-field snapshots and matching transaction IDs. | Existing create rollback plus T150 edit/archive/reactivation failures preserve full customer rows, versions, audits and confirmed sale/line/ticket/movement history. | Covered by existing create tests plus T150 update/archive/reactivation cases; fixed complete before/after snapshots, immutable purchases and transaction identity. |
| Customer-price create/deactivate/replacement; `CATALOG_CHANGED` | [Price service][prices] TX; [customer pricing][customer-tests] checks actor, safe snapshots, reason and create/deactivate events. Replacement is deactivate plus a new effective price, not an in-place history edit. | Same suite injects audit failure for create and deactivate; price and audit counts remain unchanged. | Covered primitive writes; two separate replacement commands are not claimed atomic together. |
| BusinessSetting update; `SETTING_UPDATED` | [Settings service][settings]; [user settings][admin-tests] `commits business settings…` checks stable singleton identity and `xmin`. | `rolls back business settings…` checks original values and no success audit. | Covered. |
| PrinterProfile create/edit/archive; `PRINTER_SETTING_CHANGED` | [Printer service][printers]; [user settings][admin-tests] and [printer service tests][printer-service-tests] check versioned snapshots and `xmin`. | `rolls back profile creation, edits, archival…` and HTTP audit-failure cases cover writes and unchanged history. | Covered software configuration. |
| UserPrinterPreference insert/replace; `PRINTER_SETTING_CHANGED` | [Printer service][printers]; [user settings][admin-tests] `isolates preferences…` checks both cases and `xmin`. | Parameterized insert/update failure and [printer service tests][printer-service-tests] preserve preferences. | Covered. |
| Inventory entry; `INVENTORY_CHANGED` | [Inventory][inventory] TX; [ledger][ledger] `T150 audits and rolls back inventory %s` checks event attribution, operation/movement/balance/key transaction IDs and ledger consistency. | Each valid command reaches a rejected audit insert; full balances, operations, movements, reversal links, keys and audits remain unchanged. Success plus replay is verified after removing the trigger. | Covered by T150: full-row rollback, transaction identity across audit/operation/movement/balance/key, and replay. |
| Manual exit, transfer, positive/negative adjustment; `INVENTORY_CHANGED` | [Inventory][inventory] TX; [ledger][ledger] `T150 audits and rolls back inventory %s` checks event attribution, operation/movement/balance/key transaction IDs and ledger consistency. | Each valid command reaches a rejected audit insert; full balances, operations, movements, reversal links, keys and audits remain unchanged. Success plus replay is verified after removing the trigger. | Covered by T150: each operation reaches injected audit rejection; all rows/both endpoints are preserved; success and replay verified. |
| Inventory reversal; `INVENTORY_CHANGED` | [Inventory][inventory] TX; [ledger][ledger] `T150 audits and rolls back inventory %s` checks event attribution, operation/movement/balance/key transaction IDs and ledger consistency. | Each valid command reaches a rejected audit insert; full balances, operations, movements, reversal links, keys and audits remain unchanged. Success plus replay is verified after removing the trigger. | Covered by T150: reversal of transfer, both endpoint balances, links, audit failure, transaction identity and replay. |
| Route create/assignment; `ROUTE_CHANGED` | [Load service][loads] TX; [route lifecycle][route-tests] `records route stock movements… and every audit` checks PREPARING attribution. Assignment occurs on creation; no mutable reassignment API is claimed. | `rolls back route creation when its audit cannot be written`. | Covered implemented assignment operation. |
| Load confirmation; `ROUTE_CHANGED` | [Load service][loads] TX; same lifecycle test checks CONFIRMED load event. | `rolls back load confirmation when its audit cannot be written` checks load, branch/route stock, movements, key. | Covered. |
| Route start and return; `ROUTE_CHANGED` | [Transition service][transitions] TX; lifecycle test checks EN_ROUTE/RETURNED events. | Separate `rolls back route start…` and `rolls back route return…` cases. | Covered. |
| Reconciliation approval, physical return, positive/negative difference; `ROUTE_CHANGED` | [Reconciliation][reconciliation] TX; lifecycle test checks APPROVED event and both signed difference movements. Detailed quantities/reasons persist in linked immutable reconciliation lines; event captures state/line count. | `rolls back reconciliation, movements, balances, and idempotency when audit fails`. | Covered compound reconciliation transaction. |
| Route closure; `ROUTE_CHANGED` | [Reconciliation][reconciliation] TX; lifecycle test checks CLOSED event and zero inventory. | `rolls back route closure when its audit cannot be written`. | Covered. |
| Post-close correction | [Cancellation][cancellation] redirects restore to origin branch without reopening route; [inventory][inventory] creates new linked reversals. No destructive route correction is implemented. | [Cancellation tests][cancel-tests] cover cancellation rollback and Closed restore; [ledger][ledger] T150 covers generic reversal audit failure, endpoint restoration and immutable links. | Covered: existing Closed cancellation tests plus T150 generic inventory reversal proof; no history rewriting permitted. |
| Sale confirmation; `SALE_CONFIRMED` | [Sale service][sales] TX; [sale confirmation][sale-tests] `commits one Sale, ticket, movement… and audit`. | `rolls back the Sale, ticket, stock, idempotency row, and success audit when audit fails`. | Covered. |
| Sale cancellation; `SALE_CANCELLED` | [Cancellation][cancellation] TX; [cancellation tests][cancel-tests] `restores stock… with a same-transaction audit` checks action/reason/operation. | `rolls back status, stock, cancellation, idempotency, and movement when audit insertion fails`, including unchanged audit count. | Covered. |
| Cash-close creation; `CASH_CLOSE_CREATED` | [Cash-close service][cash-close] TX; [cash reporting][cash-report-tests] now asserts the complete creation event against the nonempty source snapshot, including actor, current pointer and transaction identity. | Existing snapshot/pointer/idempotency/audit failure cases in the same passing suite reject partial close records and success audits. | Covered by existing rollback cases and T150 explicit creation event payload, actor/entity, request, timestamp and transaction identity. |
| Cash-close correction/current-pointer replacement; `CASH_CLOSE_CORRECTED` | [Cash-close service][cash-close] TX; [service tests][cash-service-tests] check old/new pointer IDs in event and immutable predecessor. | `rolls back new history, current pointer, and idempotency when auditing fails`. | Covered; failure is injected at AuditWriter, not a PostgreSQL trigger. |
| Persisted ReportSnapshot; `REPORT_SNAPSHOT_CREATED` | [Report service][reports] TX; [report repository tests][report-tests] `saves repeatable exact reports with audit and replay…` asserts one event. | Same test injects AuditWriter rejection, preserves prior snapshot and removes failed idempotency record. | Covered; no new success event can be inserted by the rejecting writer. |

The [audit writer][audit] inserts through a `Transaction<Database>`. Per-service
allowlists provide safe snapshots; its shared forbidden-field check is shallow,
so this review does not describe it as a recursive sanitizer for arbitrary objects.
Runtime ledger restrictions and immutable-history guards are in the
[foundation migration][foundation-migration] and subsequent migrations. Read-only
queries and client-local language/device choices do not mutate audited business
records. `OutputAttempt` records output outcomes; it does not replace source audits.

## Constitution compliance

| Principle | Evidence | Review status |
| --- | --- | --- |
| I. Web architecture and separation | Separate [API package][api-package]/[web package][web-package], HTTP contracts, API-owned services, independent T144 builds. | Covered inspected architecture; no browser database path identified. |
| II. API authority/security | Auth/CSRF/origin/RBAC, schema validation, safe errors; [security tests](t137-security.md), [security scanning](security-scanning.md). | Covered tested paths. Historical scan is dated evidence, not a fresh vulnerability claim. |
| III. Transactional business operations | Shared transaction/idempotency, locks/constraints, movement/source transactions; integration rollback/retry suites. | Implementation boundaries verified; T150 closes the missing audit proof A1–A4. |
| IV. Exact financial arithmetic | [Money][money], [pricing][pricing], [finance][finance], numeric schema, immutable source snapshots, rounding/period tests. | Covered inspected authoritative arithmetic and tested examples. |
| V. Auditability/history | Audit matrix above, source snapshots, FK/archive rules, immutable movements and linked corrections. | A1–A4 closed by T150; historical events remain immutable. |
| VI. Contracts/compatibility/output isolation | [Contract gates](t136-contract-gates.md), [contract package][contract-package], [document output tests][document-output], explicit UI error paths. | Software gates covered; physical output acceptance still T133. |
| VII. Testing/review gates | T144 layered execution, this traceability review, [cross-browser evidence](cross-browser-e2e.md). | **HOLD**: B1/C1 plus T133/T141; no final release approval. |
| VIII. Database evolution/reliability | [Migration/recovery evidence](t134-migrations-recovery.md), T144 clean replay, [failure signals](failure-signals.md), validated environment. | Local tooling verified; startup schema-readiness discrepancy C1 and production recovery conditions remain. |

The plan's design-stage PASS tables are design intent. They do not supersede these
implementation findings. No exception is proposed or approved. In particular,
pending acceptance is not a time-bounded exception. Any future exception must name
scope, owner, rationale, risk controls, expiry, and actual approval under
[Governance](../../../.specify/memory/constitution.md#governance).

## Findings and closure requirements

| ID | Concrete gap (initial review) | Closure / current status |
| --- | --- | --- |
| A1 (closed T150) | Catalog tests demonstrate creation events for five types but audit-failure rollback only for product create/active edit. Lifecycle variants cannot inherit a test result solely from the generic helper. | T150: parameterize product/category/unit/location/vehicle creation, edit, deactivation/archive and reactivation. Assert safe actor/action/entity/before-after/reason data, same-transaction participation, original/derived records unchanged on audit rejection, and no success audit. |
| A2 (closed T150) | Customer create has audit-failure coverage; customer update/archive/reactivation does not. | T150: add update/lifecycle success and injected-audit-failure cases, retaining historical purchases and version/active/archive state. |
| A3 (closed T150) | Inventory ENTRY audit failure is tested; exit/transfer/signed adjustments/reversal do not each have corresponding failure evidence. | T150: seed valid preconditions, prove each path reaches audit insertion, inject failure, compare both endpoint balances, operations, movements, reversals, keys and audit counts; include same-transaction success evidence. |
| A4 (closed T150) | Cash-close creation rollback is explicit, but the reviewed success tests do not explicitly assert the creation audit's actor/action/entity/snapshot payload. | T150: assert the committed `CASH_CLOSE_CREATED` event and transaction linkage; retain existing correction and failure coverage. |
| B1 | FR-051–FR-053/SC-013 exist in the current spec, beyond T145's original range. Representative component tests are not a full bilingual browser acceptance report. | T151: version a reviewed-page inventory for both roles, verify immediate switch, form preservation, dates/numbers/currency/errors, fresh Spanish default, invalid preference fallback and real refresh persistence. Retain page-level results and fix failures. |
| C1 | The plan promises startup schema validation. [main.ts][main] loads environment and starts listening; [health router][health] checks `select 1`, which also succeeds on an unmigrated/incompatible database. T144 corrected the quickstart to require migration first. | T152: implement a non-mutating schema compatibility gate before accepting traffic/readiness, with missing/stale/incompatible/current schema tests, or obtain a reviewed plan amendment with an enforced deployment compatibility gate. Environment validation alone does not prove schema readiness. |

T150 is complete; A1–A4 in the findings table above describe the original gaps and
are now closed by [T150 evidence](t150-audit-coverage.md). **T151 is the next software
task**, followed by T152. B1/C1 must be reconciled with this review before T145 can pass. These findings are evidence or implementation
gaps, not assertions that every uncovered path is defective. Re-run affected suites
after remediation and refresh clean-environment evidence for the release candidate.

External/operational closure still requires:

- T133: actual identified printer/firmware/client matrix, physical paper and reconnect/failure results in [printer acceptance](printer-acceptance.md).
- T141: remaining accessibility audit and ten real participant records using the [frozen usability protocol](usability.md), satisfying SC-003/SC-009.
- T144: complete those acceptance steps and reconcile all required quickstart gates on the candidate revision.
- Deployment owner: satisfy the [migration/recovery runbook](../../../docs/operations/migrations.md) and T134's explicit production recovery/cutover limitations; a local disposable-container restore is not protected production backup evidence.
- Release reviewer: inspect the updated matrices/results and record an actual approval decision for the candidate; hosted CI and repository branch protection were not inspected by this local review.

## Review signature and release gate

| Field | Recorded value |
| --- | --- |
| Reviewer | Codex — automated implementation/evidence review |
| Review date | 2026-09-18, America/Hermosillo |
| Reviewed code revision | Initial `5f62c81`; T150 follow-up based on `62d6ea4` plus this commit |
| Constitution | 3.0.0 |
| Review decision | **HOLD / changes and acceptance evidence required** |
| Approved exceptions | None |
| Human release approver / approval date | Not supplied; no signature fabricated |
| T145 checkbox | Remains unchecked until findings and acceptance gates are closed and release is approved |

[auth]: ../../../apps/api/src/auth/auth-service.ts
[authorization]: ../../../apps/api/src/auth/authorization.ts
[auth-tests]: ../../../apps/api/tests/contract/foundation/auth-errors.contract.test.ts
[catalog]: ../../../apps/api/src/modules/catalog/catalog-service.ts
[customers]: ../../../apps/api/src/modules/customers/customer-service.ts
[customer-router]: ../../../apps/api/src/modules/customers/customer-routes.ts
[customer-repo]: ../../../apps/api/src/modules/customers/customer-repository.ts
[prices]: ../../../apps/api/src/modules/customers/customer-price-service.ts
[users]: ../../../apps/api/src/modules/users/user-admin-service.ts
[settings]: ../../../apps/api/src/modules/settings/business-settings-service.ts
[printers]: ../../../apps/api/src/modules/printers/printer-settings-service.ts
[overview]: ../../../apps/api/src/modules/overview/overview-service.ts
[overview-tests]: ../../../apps/api/tests/integration/users/overview.test.ts
[overview-ui]: ../../../apps/web/src/features/overview/overview-page.tsx
[overview-ui-tests]: ../../../apps/web/tests/dashboard/role-overview.test.tsx
[reports]: ../../../apps/api/src/modules/reports/report-service.ts
[report-repo]: ../../../apps/api/src/modules/reports/report-repository.ts
[cash-close]: ../../../apps/api/src/modules/reports/cash-close-service.ts
[cash-repo]: ../../../apps/api/src/modules/reports/cash-close-repository.ts
[finance]: ../../../apps/api/src/modules/reports/financial-calculations.ts
[periods]: ../../../apps/api/src/modules/reports/reporting-period.ts
[money]: ../../../apps/api/src/shared/money.ts
[money-tests]: ../../../apps/api/tests/unit/shared/money.test.ts
[finance-tests]: ../../../apps/api/tests/unit/reports/financial-calculations.test.ts
[period-tests]: ../../../apps/api/tests/unit/reports/reporting-period.test.ts
[cash-service-tests]: ../../../apps/api/tests/integration/reports/cash-close-service.test.ts
[cash-report-tests]: ../../../apps/api/tests/integration/reports/cash-close-reporting.test.ts
[currentness]: ../../../apps/api/tests/integration/reports/cash-close-currentness.test.ts
[report-tests]: ../../../apps/api/tests/integration/reports/report-repositories.test.ts
[report-http]: ../../../apps/api/tests/contract/reports/reports.contract.test.ts
[report-e2e]: ../../../tests/e2e/us5-reporting.spec.ts
[report-ui]: ../../../apps/web/src/features/reports/report-pages.tsx
[loads]: ../../../apps/api/src/modules/routes/route-load-service.ts
[route-repo]: ../../../apps/api/src/modules/routes/route-repository.ts
[route-router]: ../../../apps/api/src/modules/routes/route-routes.ts
[route-projection]: ../../../apps/api/src/modules/routes/route-projection.ts
[route-domain]: ../../../apps/api/src/modules/routes/route-domain.ts
[transitions]: ../../../apps/api/src/modules/routes/route-transition-service.ts
[reconciliation]: ../../../apps/api/src/modules/routes/route-reconciliation-service.ts
[route-tests]: ../../../apps/api/tests/integration/routes/route-lifecycle.test.ts
[route-auth]: ../../../apps/api/tests/integration/routes/route-authorization.test.ts
[route-domain-tests]: ../../../apps/api/tests/unit/routes/route-domain.test.ts
[route-http]: ../../../apps/api/tests/contract/routes/routes.contract.test.ts
[route-e2e]: ../../../tests/e2e/us3-routes.spec.ts
[route-ui]: ../../../apps/web/src/features/routes/route-overview.tsx
[reconciliation-ui]: ../../../apps/web/src/features/routes/reconciliation-page.tsx
[inventory]: ../../../apps/api/src/modules/inventory/inventory-service.ts
[inventory-repo]: ../../../apps/api/src/modules/inventory/inventory-repository.ts
[inventory-router]: ../../../apps/api/src/modules/inventory/inventory-routes.ts
[inventory-ui]: ../../../apps/web/src/features/inventory/inventory-page.tsx
[inventory-http]: ../../../apps/api/tests/contract/inventory/inventory.contract.test.ts
[search-http]: ../../../apps/api/tests/contract/inventory/inventory-search.contract.test.ts
[ledger]: ../../../apps/api/tests/integration/inventory/inventory-ledger.test.ts
[ledger-assertions]: ../../../apps/api/tests/support/inventory-assertions.ts
[inventory-concurrency]: ../../../apps/api/tests/integration/inventory/inventory-concurrency.test.ts
[inventory-e2e]: ../../../tests/e2e/us1-inventory.spec.ts
[catalog-ui]: ../../../apps/web/src/features/catalog/catalog-pages.tsx
[catalog-ui-tests]: ../../../apps/web/tests/catalog/catalog-management.test.tsx
[customer-ui]: ../../../apps/web/src/features/customers/customer-pages.tsx
[customer-http]: ../../../apps/api/tests/contract/customers/customers.contract.test.ts
[customer-tests]: ../../../apps/api/tests/integration/customers/customer-pricing.test.ts
[customer-e2e]: ../../../tests/e2e/us4-customers.spec.ts
[sales]: ../../../apps/api/src/modules/sales/sale-service.ts
[sale-repo]: ../../../apps/api/src/modules/sales/sale-repository.ts
[pricing]: ../../../apps/api/src/modules/sales/pricing-service.ts
[cancellation]: ../../../apps/api/src/modules/sales/cancellation-service.ts
[sales-schemas]: ../../../packages/contracts/src/sales-schemas.ts
[sale-tests]: ../../../apps/api/tests/integration/sales/sale-confirmation.test.ts
[cancel-tests]: ../../../apps/api/tests/integration/sales/sale-cancellation.test.ts
[pricing-tests]: ../../../apps/api/tests/unit/sales/pricing.test.ts
[price-constraint]: ../../../apps/api/tests/integration/sales/customer-price-constraint.test.ts
[sales-http]: ../../../apps/api/tests/contract/sales/sales.contract.test.ts
[sales-e2e]: ../../../tests/e2e/us2-sales.spec.ts
[sale-ui]: ../../../apps/web/src/features/sales/sale-form.tsx
[admin-tests]: ../../../apps/api/tests/integration/users/user-settings.test.ts
[admin-http]: ../../../apps/api/tests/contract/users/user-settings.contract.test.ts
[admin-ui-tests]: ../../../apps/web/tests/users/user-settings-ui.test.tsx
[admin-e2e]: ../../../tests/e2e/us7-user-settings.spec.ts
[printer-service-tests]: ../../../apps/api/tests/integration/users/printer-settings-service.test.ts
[printer-ui]: ../../../apps/web/src/features/printers/printer-preference-page.tsx
[printer-ui-tests]: ../../../apps/web/tests/printers/printer-profile-ui.test.tsx
[printer-preference-tests]: ../../../apps/web/tests/printers/printer-preference.test.tsx
[documents]: ../../../apps/api/src/modules/documents/document-service.ts
[documents-repo]: ../../../apps/api/src/modules/documents/document-repository.ts
[document-http]: ../../../apps/api/tests/contract/documents/documents.contract.test.ts
[document-history]: ../../../apps/api/tests/integration/documents/document-history.test.ts
[document-auth]: ../../../apps/api/tests/integration/documents/document-authorization.test.ts
[document-output]: ../../../apps/api/tests/integration/documents/document-output.test.ts
[document-service-tests]: ../../../apps/api/tests/integration/documents/document-service.test.ts
[retry-http]: ../../../apps/api/tests/contract/documents/document-retry.contract.test.ts
[document-e2e]: ../../../tests/e2e/us6-documents-printing.spec.ts
[document-actions]: ../../../apps/web/src/features/documents/document-actions.tsx
[document-action-tests]: ../../../apps/web/tests/documents/document-actions.test.tsx
[pdf]: ../../../apps/api/src/modules/documents/pdf-renderers.ts
[pdf-tests]: ../../../apps/api/tests/unit/documents/pdf-rendering.test.ts
[print-dialog]: ../../../apps/web/src/features/printers/print-dialog.tsx
[ble]: ../../../apps/web/src/features/printers/web-bluetooth-adapter.ts
[escpos]: ../../../apps/web/src/features/printers/escpos-formatter.ts
[printer-tests]: ../../../apps/web/tests/printers/web-bluetooth-adapter.test.ts
[search-profile]: ../../../tests/e2e/performance-search.spec.ts
[document-profile]: ../../../tests/e2e/performance-success-criteria.spec.ts
[audit]: ../../../apps/api/src/shared/audit/audit-service.ts
[audit-types]: ../../../apps/api/src/shared/audit/audit-types.ts
[transactions]: ../../../apps/api/src/db/serializable-transaction.ts
[idempotency]: ../../../apps/api/src/shared/idempotency/idempotency-service.ts
[db-tests]: ../../../apps/api/tests/integration/database-migrations.test.ts
[foundation-migration]: ../../../database/migrations/001_foundation.ts
[catalog-migration]: ../../../database/migrations/002_catalog_inventory.ts
[sales-migration]: ../../../database/migrations/003_sales_core.ts
[route-migration]: ../../../database/migrations/004_route_lifecycle.ts
[report-migration]: ../../../database/migrations/005_reporting.ts
[i18n]: ../../../apps/web/src/i18n/index.ts
[language-ui]: ../../../apps/web/src/features/settings/settings-page.tsx
[language-tests]: ../../../apps/web/tests/settings/language-settings.test.tsx
[main]: ../../../apps/api/src/main.ts
[health]: ../../../apps/api/src/http/health-routes.ts
[api-package]: ../../../apps/api/package.json
[web-package]: ../../../apps/web/package.json
[contract-package]: ../../../packages/contracts/package.json

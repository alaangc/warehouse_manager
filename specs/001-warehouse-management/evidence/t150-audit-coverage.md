# T150: Complete mutation audit and rollback evidence

Executed 2026-09-18 (America/Hermosillo), based on `62d6ea4` plus this task's changes.
**Status: PASS for T150 / A1–A4.** This closes the specified audit coverage findings;
it does not approve release or replace T133/T141 acceptance or T151/T152 remediation.

## Coverage and assertions

| Finding | Verification |
| --- | --- |
| A1 Catalog lifecycle | 20 parameterized cases: product, category, unit, location and vehicle × create, edit, archive and reactivate. Each starts from valid prerequisites, rejects the actual audit insert, compares full primary/catalog/derived-stock-location/audit rows with the pre-command snapshot, then executes successfully. Actor/action/entity, timestamp, request correlation, reason, before/after lifecycle values, safe snapshots and matching business/audit PostgreSQL transaction IDs are asserted. Location creation also checks the derived stock location's transaction ID. |
| A2 Customer lifecycle | Three cases: edit, archive and reactivate a customer with an existing confirmed purchase. Audit rejection preserves the customer and complete sale/line/ticket/movement history. Successful writes preserve that same historical purchase and assert before/after editable values, version, active/archive state, actor, reason and transaction identity. |
| A3 Inventory mutations | Six cases: entry, manual exit, transfer, positive adjustment, negative adjustment and reversal of a transfer. Rejected writes preserve all balances (including both transfer endpoints), operations, movements, reversal links, idempotency rows and audit rows. Success checks operation/audit/movement/affected-balance/idempotency transaction identity, ledger-derived balances and reversal links. Replaying the successful command leaves all rows unchanged. Existing route/sale/reconciliation suites remain the evidence for their specialized inventory operations. |
| A4 Cash-close creation | The existing nonempty-source snapshot test now explicitly checks the successful `CASH_CLOSE_CREATED` event, actor, entity, null previous state, complete captured response/current pointer, timestamp, request correlation, safe fields and matching cash-close/audit transaction IDs. Existing snapshot/pointer/idempotency/audit failure cases remain in the same passing suite. |

The shared [audit verification helper](../../../apps/api/tests/support/audit-verification.ts)
installs a PostgreSQL `BEFORE INSERT` trigger that increments a sequence and raises
the exact injected error. The sequence survives transaction rollback, proving that
the command reached audit insertion rather than merely failing validation. The helper
always removes its trigger/function/sequence. Full JSON row snapshots exclude sequence
counters intentionally: PostgreSQL sequences are not transactional. No runtime
permissions, production audit behavior or business rules are weakened for the tests.

Tests are in [inventory ledger](../../../apps/api/tests/integration/inventory/inventory-ledger.test.ts),
[customer pricing](../../../apps/api/tests/integration/customers/customer-pricing.test.ts),
and [cash-close reporting](../../../apps/api/tests/integration/reports/cash-close-reporting.test.ts).
There are 29 added cases and one strengthened existing cash-close test.

## Defect exposed and fixed

The initial run had **42 passes and 3 failures**. Every failure was a new customer
lifecycle success assertion: `after_values` contained only `active` and `version`,
omitting the changed display name and city. The catalog/inventory cases and cash-close
creation assertion already passed. All three customer failure-injection/rollback
checks completed before their missing-payload assertions failed.

[CustomerService](../../../apps/api/src/modules/customers/customer-service.ts) now
uses one explicit field allowlist for newly written creation and before/after update
snapshots: customer number, display name, contact name, phone, email, address, city,
notes, active/archive state and version. Tests also cover the remaining editable
fields. It uses the locked prior row and persisted result in the existing transaction.
No old audit records are rewritten; no API response, schema, sale or stock behavior changes.

## Execution results

Environment: Windows, Node.js 24.18.0, pnpm 10.28.1, PostgreSQL 18 disposable
Testcontainers using the existing `postgres:18-alpine` image. No application database
URL override was used. Tests execute serially by file with the existing suite timeouts.

| Gate | Result |
| --- | --- |
| New tests before fix | 42 passed, 3 failed in 3 files; 26.25 s Vitest duration. |
| Same three integration suites after fix | **45 passed, 0 failed, 0 skipped**, 3 files; 19.05 s Vitest duration. |
| Customer HTTP contracts after fix | **6 passed, 0 failed, 0 skipped**, 1 file; 7.83 s Vitest duration. |
| `pnpm lint` | Passed, zero warnings. |
| `pnpm typecheck` | Passed across workspace and scripts. |
| Prettier on five changed TypeScript files | Passed; formatted before final integration run. |
| Documentation links/task IDs and `git diff --check` | Passed before commit. |

The first local static-command wrapper mishandled single-element PowerShell arrays:
it invoked `l` instead of lint and `t` (the test alias) instead of typecheck. The latter
unintended run was interrupted; Docker setup failures in that sandbox are not application
regressions or accepted verification. The wrapper was corrected to a typed string array;
the actual lint and typecheck commands then passed. Original local diagnostic logs are
retained under `var/t150/runner-*-initial*`. Deliberate audit rejections emit expected
operational-failure logs during the valid integration run.

Raw local command logs and exit-code/timing records are under `var/t150/`; they are
not committed because they include transient test diagnostics. The committed source,
assertions and the commands below reproduce the coverage. The earlier T144 full-suite
record remains dated evidence; this task does not claim a new full-suite/clean-clone,
browser, physical-printer, usability or hosted-CI run.

```sh
pnpm exec vitest run --config vitest.workspace.ts --project api-integration apps/api/tests/integration/inventory/inventory-ledger.test.ts apps/api/tests/integration/customers/customer-pricing.test.ts apps/api/tests/integration/reports/cash-close-reporting.test.ts --no-file-parallelism
pnpm exec vitest run --config vitest.workspace.ts --project api-contract apps/api/tests/contract/customers/customers.contract.test.ts --no-file-parallelism
pnpm lint
pnpm typecheck
```

On Windows use `pnpm.cmd` if PowerShell blocks the script shim. Docker must be
available to the test process. Next software task: **T151**, bilingual browser acceptance.

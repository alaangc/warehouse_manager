# T119 document HTTP contract red phase

Verified on 2026-09-11 against disposable PostgreSQL 18 databases.

## Coverage

- Checked-in OpenAPI operations, four valid source pairs, sole `TICKET` sale-document type, PDF media type, pagination bounds and history filters.
- Strict independent response schemas for document resources, attempts and pages; safe problem responses on denial.
- Administrator generation/status/content and GENERATE/DOWNLOAD/SHARE for all four types, PRINT/REPRINT for the three printable types.
- Driver own-sale and assigned-confirmed-load access, including reuse/content/history/attempts created by an Administrator.
- Rejection of all twelve invalid document/source pairings and unsupported invoice/sale-ticket aliases.
- Authorization before draft-state checks, canonical reuse or REPORT print capability validation; REPORT printing returns 422 for an Administrator and 403 for a Driver. Rejected output attempts must not be persisted.
- Default limit 25, accepted limit 100, rejected limit 101 and invalid pagination/filter values; bounded opaque cursor traversal without duplicate IDs, principal/filter binding and tamper rejection.
- Document type/state/source/time and attempt document/mode/state/time filtering, direct attempt reads, and source-filter/cursor restrictions.
- Other-driver Sales, unassigned Route Loads, Cash Closes and Reports excluded from Driver lists and denied through direct/filter access. TEST_PRINT history remains Administrator-only even when the Driver recorded the attempt.

## Evidence

- New suites: **58 tests: 4 passed, 54 expected failures, 0 skipped**.
- All 54 failures are missing document/history routes returning 404 instead of the asserted 200/202/403/422. Setup succeeds; failures are not container, fixture, import or authentication failures.
- Existing HTTP contract suites were executed separately and passed.
- `pnpm lint`, `pnpm typecheck` and changed-test Prettier checks passed.
- No production modules, OpenAPI contracts or dependencies changed. Document implementation remains T123–T127; these tests intentionally keep the full contract gate red until that work exists.

The shared harness starts from the established sales fixture, sets each fresh fixture route to PREPARING before business commands, then uses the existing load confirmation/start, sale, cash-close and report HTTP APIs. A separate Driver owns the draft route so fixture setup respects the one-active-route rule. The history fixture creates 27 distinct committed Sale sources instead of fabricating document rows. No external database or physical printer is used.

The test suite currently specifies 403 for principal/filter cursor scope mismatch and 422 for malformed/tampered cursors. These are the proposed HTTP error semantics for T127, consistent with authorization versus input validation; no existing cursor implementation was changed.

## Reproduction

Use `.tools/bin/pnpm.cmd` with `.tools/bin` on PATH and Docker running.

```text
pnpm.cmd exec vitest run --config vitest.workspace.ts --project api-contract apps/api/tests/contract/documents
pnpm.cmd exec vitest run --config vitest.workspace.ts --project api-contract --exclude **/documents/*.contract.test.ts
```

The first command currently exits 1 by design. The second exits 0. Raw local reports are in `var/t119-red.json` and `var/t119-regression.json`; they are not source artifacts. T120 adds the broader database constraints, race and output-isolation integration coverage.

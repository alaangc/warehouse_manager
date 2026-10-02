# T140 — Critical cross-browser workflows

Validated on 2026-09-16 against base commit `4b4dba0`. The final result for each
case is **40 passed, two expected skips, zero unresolved failures**. Automatic
retries were disabled for both invocations.

| Browser | Version | Passed | Expected skips | Unresolved failures |
| --- | --- | ---: | ---: | ---: |
| Chromium | 151.0.7922.34 | 14 | 0 | 0 |
| Firefox | 153.0 | 13 | 1 | 0 |
| WebKit | 26.5 | 13 | 1 | 0 |

The [machine-readable evidence](./cross-browser-e2e.json) retains all 42 initial
results and all three inventory verification results, including timings, errors,
skip reasons, retry indices, environment and source hashes. The table uses the
latest result per case; it is not a claim that the initial run was entirely green.

Environment: Windows 10.0.26200, AMD Ryzen 7 7445HS, 12 logical CPUs,
16,396,115,968 bytes RAM, Node 24.18.0, pnpm 10.28.1, Playwright 1.62.1 and
PostgreSQL 18.6. All services and browser engines ran on the same machine.

## Failure and verification record

1. Full suite, started `2026-09-16T19:34:47.791Z`, duration 415.2 seconds:
   39 passed, one failed, two expected skips, zero retries.
2. WebKit's inventory walkthrough reached the default 30-second **whole-test**
   timeout during the Driver phase. The trace shows the Administrator's entry,
   transfer, adjustments, reversal, insufficient-stock rejection and movement-history
   assertions already completed. The last option click was interrupted by teardown,
   rather than spending 30 seconds stuck on that element.
3. `us1-inventory.spec.ts` now grants this two-session, multi-command functional
   walkthrough 60 seconds. Per-assertion limits and all business/security assertions
   are unchanged. No application code or SC-006/SC-007 performance limits changed.
4. Inventory was rerun on a fresh isolated stack in **all three browsers**, starting
   `2026-09-16T19:42:04.232Z`: three passed in 77.1 seconds, zero retries. WebKit
   completed the entire test in 33.6 seconds. All other cases retain their passing
   full-suite results because the only executable change is this test's time budget.

The initial trace and error context remain in `var/t140-initial-inventory-webkit/`.
The raw local reporter files are `var/t140-initial.json` and
`var/t140-inventory-verification.json`; their SHA-256 hashes are in the committed
evidence. No test was disabled to resolve the failure. Changed-test ESLint,
Prettier and `git diff --check` passed.

## Scope and setup

The complete functional Playwright suite contains 42 cases across 10 files:
14 cases each for Chromium, Firefox and WebKit. Performance suites remain separate
(T138/SC-006 and T139/SC-007).

The run uses one worker and zero automatic retries, a fresh migrated and seeded
PostgreSQL 18 database, the Express API and Vite development server. Document and
administration fixtures use their own disposable PostgreSQL-backed API servers.
The existing local PostgreSQL harness validates localhost and version 18, creates
UUID-named databases and never uses the application's `DATABASE_URL`.

| Area | Assertions covered |
| --- | --- |
| Administration | Desktop/mobile user management, settings, role denial, access revocation and retained actor history |
| Inventory | Atomic entries/transfers/reversals, exact balances, low-stock state, movement history and denied Driver mutations |
| Sales | Confirmation, ticket retry, cancellation and Driver-scoped history |
| Routes | Load/start/return/reconcile/close, mandatory reasons, zero inventory on close, retry safety, immutable history and resource scope |
| Customers | Price precedence/fallback, customer history and role boundaries |
| Reporting | Calendar boundaries, exact totals, cancellation exclusion, concurrent cash-close creation/correction and immutable currentness |
| Documents | All four portable PDFs, canonical reuse, source authorization, paginated history and forbidden direct URLs/attempts |
| Printer UI | Approved printer selection, durable attempts, simulated BLE success/UNKNOWN/reprint and REPORT rejection |
| Responsive document UI | Desktop/mobile document history, downloads and simulated sharing with explicit HTTP fixtures |

The two document-layout cases per browser deliberately mock HTTP responses. Other
workflow cases exercise real API/database behavior, including fixtures that proxy
browser requests to their isolated API. Bluetooth and OS sharing are simulated;
this does not replace T133 physical-printer acceptance. The Chromium-only committed
printing test is intentionally skipped on Firefox and WebKit; portable PDFs run
on all three engines.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm --filter @warehouse/contracts build
pnpm exec playwright install --with-deps chromium firefox webkit
E2E_ISOLATED_STACK=1 E2E_BASE_URL=http://127.0.0.1:5173 \
  PLAYWRIGHT_JSON_OUTPUT_NAME=var/t140-initial.json \
  pnpm exec playwright test --retries=0 --reporter=list,json
```

For the targeted correction verification, use the same environment with
`PLAYWRIGHT_JSON_OUTPUT_NAME=var/t140-inventory-verification.json` and run:

```sh
pnpm exec playwright test tests/e2e/us1-inventory.spec.ts --retries=0 \
  --reporter=list,json --output=test-results/t140-inventory-verification
```

The default database provider is disposable PostgreSQL 18 in Docker. This Windows
run sets `TEST_POSTGRES_ADMIN_URL` to the dedicated local test server and
`PLAYWRIGHT_BROWSERS_PATH` to the installed browser directory. In PowerShell, set
those variables with `$env:NAME = 'value'` before invoking pnpm. Use
`.tools/bin/pnpm.cmd` where the PowerShell script shim is blocked.

The JSON reporter records each test's status, duration, retry index and skip
annotations. Failure screenshots/traces and explicit desktop/mobile captures are
written to `test-results/`; the existing CI workflow uploads browser diagnostics.

## Console observations and limits

The development server logged React/MUI diagnostics during inventory, sale and
route workflows: an initially undefined operation selector, uncontrolled-to-controlled
input transitions, empty select children and temporarily unavailable select values.
It also logged Kysely's deprecated `orderBy('column asc')` usage and Node color-env
warnings. These observations are retained here rather than claiming a clean console;
test assertion failures and retries are counted separately in the results.

This is local Windows/browser-engine acceptance, not an observation of hosted CI or
Safari on Apple hardware. It does not establish T141's human usability results or
T133's physical printing results. No real customer data or production database was
used.

# T130 document UI validation

Date: 2026-09-13

## Implemented

- Canonical document requests with CSRF and a stable idempotency key for explicit retries; PENDING polling stops on READY, FAILED, or query errors.
- READY-only PDF download with checked content type, safe server filename/fallback, and object-URL cleanup. No business mutation is repeated.
- Document and output-attempt history with type/state/source/document/mode/time filters, opaque next/previous cursors, first-page recovery, empty/loading/error states, and on-demand detail.
- Driver filters omit cash closes, reports, and TEST_PRINT. Authorization stays authoritative on the API; authorized Administrator-created documents and attempts remain visible to Drivers.
- Actor/role-scoped cache keys and hidden stale rows after failed history reads. Denied status/content requests remove output actions.
- English/Spanish strings, native date inputs, responsive filters/tables/dialogs, Lucide controls, navigation entry, and generation controls at committed sale, confirmed route-load, cash-close, and report-snapshot views.
- Updated the report UI test's placeholder snapshot ID to a valid contract UUID.

## Evidence

- Initial history baseline: 13 failures due to the missing module.
- Existing T130 history/output cases: 23 passed. T131 share and T132 print cases intentionally excluded from this task's run.
- New document regressions plus sales/routes/reports: 27 passed.
- Focused ESLint: zero warnings. Workspace build: passed; existing large web bundle warning remains.
- Chromium Playwright HTTP-fixture checks: 2 passed at 1440x900 and 390x900, checking pagination, document/attempt detail, PDF filename, and no page-width overflow.
- Inspected screenshots under `output/t130-*.png`; animations disabled for stable captures.

Commands use `.tools/bin/pnpm.cmd`. Browser checks use `PLAYWRIGHT_BROWSERS_PATH=C:/stock_control/.tools/playwright`, `E2E_SKIP_SERVER=1`, `E2E_BASE_URL=http://127.0.0.1:5175` and `playwright test tests/e2e/documents/document-center-ui.spec.ts --project chromium`.

Browser checks use intercepted HTTP fixtures, not a live database. Firefox/WebKit checks could not run because compatible executables were absent. Native share and output-attempt acceptance remain T131/T132 respectively. No physical printer validation is claimed.

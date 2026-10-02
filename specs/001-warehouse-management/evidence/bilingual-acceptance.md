# T151: Bilingual acceptance

Executed 2026-09-19 (America/Hermosillo), based on `6a132dc` plus the
T151 changes. Reviewed inventory: **BILINGUAL-1**. Database fixture:
**BILINGUAL-FIXTURE-1**.

## Scope and method

The inventory in `tests/e2e/bilingual-acceptance.spec.ts` covers the implemented
router pages for Administrator and Driver, plus populated form, validation,
document, printing, reporting, mobile navigation and access-denied states.
The preparing-route case uses a second Driver. Each browser worker uses a fresh
PostgreSQL 18 database, migrations, real HTTP handlers and authenticated sessions.
Browser requests are forwarded to that worker's API; responses are not stubbed.

Each inventory case checks English -> Spanish -> English through the visible
language selector, without navigation or page reload. It compares the URL,
`performance.timeOrigin`, input/textarea/select values and checkboxes, checks
translated visible resource strings and case-specific labels, and compares
business/audit database rows before and after switching. Non-read API requests
during switching fail the case. Native form values retain API decimal/date
syntax; customer/product names, notes and other business data are not translated.

Each case then reloads the actual page in Spanish and English and verifies the
stored preference. No storage-writing initialization script can mask a broken
reload. Separate cases exercise the direct Settings selector for both roles,
fresh-browser Spanish default, invalid stored preference fallback, and login
inputs/errors while switching. Sales and cash-close cases explicitly check
localized timestamps and decimal/currency presentation. Component tests also
cover exact decimals beyond Number's safe integer range and long fractions.

The visible-resource scan checks strings actually present in the selected state;
it is not a claim to exercise every possible server error or asynchronous state.
The printing cases inspect the dialog without accessing physical devices.
This record does not replace T133 physical printing or T141 human usability.

## Changes verified

- Shared language controls in the application bar, mobile navigation and modal
  workflows keep current forms and validation mounted while switching.
- Catalog/customer validation stores translation keys and renders current-language
  messages. API failures use stable localized codes in both languages.
- Report, cash-close, overview and document presentation uses locale formatting;
  decimal formatting preserves all original fractional digits and trailing zeros.
- Printer write modes are translated while protocol values remain unchanged.

## Execution results

The full Chromium inventory initially finished with 52 passed and four failed
(711.1 seconds). The complementary Firefox/WebKit selection initially finished
with 12 passed and two failed (249.4 seconds). Failures were investigated and
corrected, then rerun explicitly; automatic retries were disabled.

Corrections included outdated login text and required-field locators, a missing
confirmed route load in the reconciliation fixture, API request teardown during
real reloads, the unmapped `PRODUCT_NOT_FOUND` code, and translated printer option
values. The final fixture drains forwarded requests before page disposal and only
ignores fulfill errors when the browser reports that the request was cancelled.
It still propagates errors for live requests. Intermediate correction runs and
their failures remain in local logs.

Static/component gates: 232 web tests in 24 files passed. After the printer
selection regression assertion and error-code correction, the two affected
test files passed again (11 tests). Workspace typecheck, the web production build,
ESLint over the reviewed web/test paths, and Prettier over changed code passed.
The production build retains its existing large-chunk warning. Existing MUI
empty-select/out-of-range development warnings were observed; this is not a
console-clean certification or a replacement for the remaining T141 audit.

The retained per-case result table below combines the full inventory and focused
verification. It does not describe one all-green full-suite run. Firefox/WebKit
coverage is a complementary selection, not the full Chromium page inventory.

Final combined coverage: **56/56 Chromium cases passed**, plus **10/10 Firefox**
and **10/10 WebKit** cases. The final five-case correction run recorded 14 passed
and one Chromium teardown failure (260.6 seconds); the fixture correction was
then verified by all three reconciliation cases passing (99.8 seconds).
Exact run timestamps, durations, initial statuses and case IDs are retained in
[sanitized machine-readable results](bilingual-results.json).

| BILINGUAL-1 case ID | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| admin-overview | PASS | Not run | Not run |
| admin-inventory | PASS | Not run | Not run |
| admin-product | PASS | Not run | Not run |
| admin-movements | PASS | Not run | Not run |
| admin-customers | PASS | Not run | Not run |
| admin-sales-history | PASS | Not run | Not run |
| admin-routes-active | PASS | Not run | Not run |
| admin-documents | PASS | Not run | Not run |
| admin-attempts | PASS | Not run | Not run |
| admin-document-detail | PASS | PASS | PASS |
| admin-attempt-detail | PASS | Not run | Not run |
| admin-settings | PASS | Not run | Not run |
| driver-overview | PASS | Not run | Not run |
| driver-inventory | PASS | Not run | Not run |
| driver-product | PASS | Not run | Not run |
| driver-movements | PASS | Not run | Not run |
| driver-customers | PASS | Not run | Not run |
| driver-sales-history | PASS | Not run | Not run |
| driver-routes-active | PASS | Not run | Not run |
| driver-documents | PASS | Not run | Not run |
| driver-attempts | PASS | Not run | Not run |
| driver-document-detail | PASS | Not run | Not run |
| driver-attempt-detail | PASS | Not run | Not run |
| driver-settings | PASS | Not run | Not run |
| admin-catalog | PASS | PASS | PASS |
| driver-catalog | PASS | Not run | Not run |
| admin-inventory-draft | PASS | Not run | Not run |
| admin-customer-create | PASS | Not run | Not run |
| admin-route-create | PASS | Not run | Not run |
| driver-route-load | PASS | Not run | Not run |
| admin-reconciliation | PASS | PASS | PASS |
| admin-users | PASS | Not run | Not run |
| admin-printer-editor | PASS | PASS | PASS |
| admin-cash-close | PASS | Not run | Not run |
| admin-cash-correction | PASS | Not run | Not run |
| admin-report-SALES_BY_DRIVER | PASS | Not run | Not run |
| admin-report-BEST_SELLING_PRODUCTS | PASS | Not run | Not run |
| admin-report-INVENTORY_BY_BRANCH | PASS | Not run | Not run |
| admin-report-FINANCIAL_SUMMARY | PASS | Not run | Not run |
| driver-sale-customer | PASS | Not run | Not run |
| driver-sale-products | PASS | PASS | PASS |
| driver-sale-review | PASS | Not run | Not run |
| driver-sale-result | PASS | Not run | Not run |
| admin-print-dialog | PASS | Not run | Not run |
| admin-navigation | PASS | PASS | PASS |
| driver-print-dialog | PASS | Not run | Not run |
| driver-navigation | PASS | Not run | Not run |
| admin-api-error | PASS | PASS | PASS |
| admin-api-generic-error | PASS | Not run | Not run |
| driver-denied-reports | PASS | Not run | Not run |
| driver-denied-cash-closes | PASS | Not run | Not run |
| driver-denied-users | PASS | Not run | Not run |
| driver-denied-printer-profiles | PASS | Not run | Not run |
| fresh and invalid preferences default to Spanish; login preserves input and errors | PASS | PASS | PASS |
| admin direct Settings selector | PASS | PASS | PASS |
| driver direct Settings selector | PASS | PASS | PASS |

## Reproduction

Use the repository's Node 24 / pnpm 10.28.1 toolchain, Docker and installed
Playwright browser binaries. The full matrix can run with:

```powershell
$env:E2E_ISOLATED_STACK = '1'
pnpm exec playwright test bilingual-acceptance.spec.ts --reporter=list,json
pnpm exec vitest run --config vitest.workspace.ts --project web --maxWorkers=2
pnpm typecheck
pnpm build:web
```

Local execution logs and raw browser reports are retained under `var/t151/`.
Do not publish raw traces or request logs containing authentication cookies.

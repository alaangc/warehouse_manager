# T132: Authorized print, test and reprint dialog

Verified 2026-09-13 (America/Hermosillo), on main after T131, using Node.js
24.20.0, pnpm 10.28.1, Playwright 1.62.1 and disposable PostgreSQL containers.

## Behavior and compatibility review

- The document center and canonical-ID document links open an English/Spanish print
  dialog. Drivers see only their own Sale Tickets and assigned confirmed route loads;
  Administrators also have cash-close output. DRAFT loads and REPORT have no print action.
- The additive `/documents/{documentId}/print-data` endpoint authorizes the source
  before returning a validated immutable snapshot. It does not calculate prices,
  change business records, generate a document or record an output attempt.
  Existing API responses are unchanged. Both reviewed and generated OpenAPI include it.
- The dialog validates the snapshot, active printer profile and accepted attempt
  response. STARTED must be accepted before any test/document write. API errors
  403/409/422 stop output and show an explicit error. Non-ready documents cannot
  start printing, including through direct API requests.
- Double clicks are locked out. Unmounting or changing the authenticated identity
  disconnects the adapter and prevents late responses from starting device work.
- Prior PRINT/REPRINT history, including unresolved STARTED, requires explicit
  reprint confirmation even after reopening. An uncertain write disconnects the
  adapter; reconnecting does not print. Confirmed reprints use the formatter's
  REIMPRESION marker. A successful transfer is not represented as proof of paper output.
- Terminal states are displayed only after API acceptance. If recording fails, a
  separate save-only retry uses the same idempotency key and never resends bytes.
  Browser download/share fallback uses the existing authorized document actions.

## Verification

- All frontend tests: 21 files, 214 tests passed.
- Document API contract/integration/unit suites: 11 files, 190 tests passed, followed
  by the expanded document HTTP suite: 38 passed (two additional non-ready/snapshot
  immutability regressions). The final document suite totals 192 tests.
- `us6-documents-printing.spec.ts`: 4 passed, 2 intentionally skipped. Chromium,
  Firefox and WebKit downloaded all four PDFs. Chromium additionally printed three
  supported types through simulated BLE, rejected REPORT before writes, and exercised
  uncertain delivery, reconnect and explicit reprint. The Chromium-only transport
  scenario is skipped on Firefox/WebKit, not the portable PDF checks.
- Workspace lint/type checks, independent API and web builds, OpenAPI lint and
  generated-contract comparison passed. The existing Vite bundle-size warning remains.
- Strict TypeScript checks also cover the new UI regression tests, which are not
  included in the production web tsconfig. Modified-file formatting and diff checks pass.

Reproduce using the pinned Node/pnpm versions and a running Docker engine:

```sh
pnpm install --frozen-lockfile
pnpm --filter @warehouse/contracts build
pnpm exec vitest run --config vitest.workspace.ts --project web
pnpm exec vitest run --config vitest.workspace.ts --project api-contract apps/api/tests/contract/documents --project api-integration apps/api/tests/integration/documents --project api-unit apps/api/tests/unit/documents
E2E_ISOLATED_STACK=1 E2E_BASE_URL=http://127.0.0.1:5173 pnpm exec playwright test tests/e2e/us6-documents-printing.spec.ts
pnpm lint
pnpm typecheck
pnpm build:api
pnpm build:web
pnpm contract:lint
pnpm contract:check-diff
```

## Constitution and remaining gate

Compliance review: authorization and persistence remain in the Express API;
historical amounts are consumed as exact saved strings; output errors never retry
sales, loads or cash-close commands; no database/schema change or history rewrite
is introduced. Permitted/denied, retry, no-duplicate and contract boundaries have
automated coverage. Frontend and API builds remain independent.

This is software verification, **not T133 physical-printer acceptance**. No real
device was connected and no printed paper was inspected. T133 and the release-wide
hardware/reviewer gates remain unchecked.

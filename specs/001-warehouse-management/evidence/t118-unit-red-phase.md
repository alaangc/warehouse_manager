# T118 unit-test red phase

Verified on 2026-09-11. This task adds failing tests, not document output implementation.

## Results

- New suites: **37 tests fail as expected** (13 PDF, 24 formatter/transport).
- Existing API unit and frontend suites: **23 suites, 141 tests pass**, excluding only the two new T118 files.
- No production modules, dependencies, database records or device writes were changed.
- PDF snapshots are committed semantic content snapshots observed through real PDFKit text calls; they are not visual page baselines. Actual bytes must also have PDF framing and matching SHA-256 hashes. Visual PDF acceptance belongs to renderer implementation.

## Proposed implementation boundaries

These are test-defined interfaces for the future implementations, not existing public HTTP contracts:

- T125 exports `renderDocumentPdf(source)` from `pdf-renderers.ts`. The immutable source includes document/source identity, state, content version, locale, currency, timestamp and a snapshot. The result contains `bytes`, `filename`, `contentHash` and `contentType`.
- T129 exports `formatEscPos(document, { profile, mode, confirmed? })` from `escpos-formatter.ts`, returning bytes. Test fixtures require the three business templates, CP437/CP850/UTF-8 Spanish text, 32/48 columns for the selected 58/80 mm profiles and a `REIMPRESION` label.
- T128 extends `WebBluetoothPrinterAdapter` with `print(document, { mode, confirmed? })`, returning the existing result-state shape. Tests require sequential bounded writes, inter-chunk delay, FAILED before writes, UNKNOWN after ambiguous writes and explicit reprint confirmation. REPORT and draft route loads must be rejected before any write.

Source fixture DTOs can be reconciled with the immutable loaders during T124/T125 without weakening the assertions. Existing T117 capability, permission, UUID, disconnect and setup-test cases remain green.

## Reproduction

Use `.tools/bin/pnpm.cmd` with `.tools/bin` on PATH.

```text
pnpm.cmd exec vitest run --config vitest.workspace.ts apps/api/tests/unit/documents/pdf-rendering.test.ts apps/web/tests/printers/printer-adapter.test.ts
pnpm.cmd exec vitest run --config vitest.workspace.ts --project api-unit --project web --exclude **/pdf-rendering.test.ts --exclude **/printer-adapter.test.ts
```

The first command must currently exit 1: missing `pdf-renderers`, missing `escpos-formatter`, and missing adapter `print` explain all 37 failures. Do not mark these tests skipped or use expected-failure annotations to make the implementation gate green. The second command exits 0.

Full unit/frontend runs will remain red until T125/T128/T129 implement the required behavior. No physical printer compatibility is claimed.

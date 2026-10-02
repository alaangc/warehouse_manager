# T125 PDF rendering validation

Date: 2026-09-12

Implemented PDFKit renderers for TICKET/SALE, confirmed ROUTE_LOAD/ROUTE_LOAD,
CASH_CLOSE/CASH_CLOSE, and REPORT/REPORT_SNAPSHOT. The renderer consumes persisted
snapshots, preserves decimal strings, and returns PDF bytes, a safe source-ID-based
filename, and SHA-256 of those bytes. Creation/modification metadata derives from the
source timestamp, so a later retry produces identical bytes. Route-load sources must
explicitly carry CONFIRMED; the repository now supplies this state.

## Automated checks

- 25 PDF tests pass, including the original 13 T118 cases and added coverage for
  actual wall-clock changes, repository-shaped reports and cash closes, binary-money
  rejection, missing/DRAFT load state, multiple pages, oversized text, empty reports,
  and writer failures.
- 45 focused document/cursor tests pass in total.
- API TypeScript build, focused ESLint, Prettier, and `git diff --check` pass.
- Corrected the original semantic snapshot assertion to match whole decimal values:
  `10.00` must not match the historical unit price `10.0050`.

Reproduce automated checks from the repository root:

```powershell
.\.tools\bin\pnpm.cmd exec vitest run --config vitest.workspace.ts --project api-unit apps/api/tests/unit/documents apps/api/tests/unit/shared/scoped-cursor.test.ts
.\.tools\bin\pnpm.cmd --filter @warehouse/api build
```

Use `pnpm` directly on systems where the pinned workspace package manager is on PATH.

## Visual and extracted-text review

Generated four local QA PDFs and rendered all seven pages with PDF.js and a Canvas
renderer. Inspected all pages in a contact sheet and the detailed ticket page.

| Sample | Pages | Content checked |
| --- | --- | --- |
| Ticket | 3 | 36 wrapped product names, exact quantities/prices, first and last rows, total `9007199254740993.21` |
| Confirmed route load | 1 | Eight product rows, quantities, units, route and load identifiers |
| Cash close | 1 | Period bounds, correction reason, group totals, partner rate and both preserved shares |
| Report | 2 | Persisted best-selling-product rows and large exact gross/partner/remaining totals |

Verified Spanish accents (Piñata, café, maíz, carbón), readable headers, aligned
columns, page numbers, and absence of clipped rows or blank footer-created pages.
Independent extraction from the generated PDF bytes confirmed accented text and the
large exact ticket total. The temporary QA script initially contained mojibake after
a PowerShell encoding conversion; its input was corrected and all samples were
regenerated before this final review.

## Scope and remaining gates

T125 is a pure renderer and needs no database. It does not authorize requests, write
files to document storage, or repeat business transactions. T126/T127 will connect
the renderer to generation/storage/status and HTTP authorization. T123/T124 PostgreSQL
validation remains pending because this environment has no Docker runtime; this
renderer validation does not claim those gates or the physical-printer acceptance gate.

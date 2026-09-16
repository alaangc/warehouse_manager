# T139 — Portable-document performance acceptance

SC-007 passed on 2026-09-16T19:28:51.273Z: **400/400 (100%)** complete PDF downloads
within 10,000 ms; at least 95% is required. No browser page errors occurred.

| Metric | Milliseconds |
| --- | ---: |
| p50 | 2095.0 |
| p95 | 2661.2 |
| p99 | 2992.4 |
| Maximum | 3100.0 |

The [raw report](./document-performance.json) contains all 400 measurements. Its
base commit is 6a0cdda; source hashes identify the measured merge working
tree, which accompanies this evidence in the integration commit.

Environment: Windows 10.0.26200; AMD Ryzen 7 7445HS, 12 logical CPUs;
16,396,115,968 bytes RAM; Node 24.18.0; pnpm 10.28.1; Chromium 151.0.7922.34;
PostgreSQL 18.6 for Windows (MSVC 19.44.35228, 64-bit); Vite production build.
API, database and browsers ran locally. This run used the local PostgreSQL harness.

## Workload and measurement

- Seed: `warehouse-t139-v1`, extending T138's `wm-perf-v1` with the same exact
  10,000 products, 10,000 customers, 100,000 COMPLETED sales, sale lines and tickets.
  T139 spaces sales 108 seconds apart so 125 distinct daily reporting periods have
  contributing sales. The default T138 search fixture remains unchanged.
- Additional sources: 125 confirmed ten-line route loads, 125 nonempty daily cash
  closes and 125 FINANCIAL_SUMMARY snapshots. Production services create these
  sources with constraints, audit events, idempotency and inventory accounting
  enabled. Preparation is outside measurement; no business mutation occurs during
  timed document generation.
- 25 separate authenticated Administrator browser contexts and distinct trusted-proxy
  client IPs. Rate limits remain enabled.
- Each user warms all four output types, then independently runs 16 measured
  actions, rotating the four types. There is no global round barrier, think time,
  response mock or retry. Each user waits for its preceding download and integrity
  checks before starting the next request.
- 100 warmups followed by 400 measurements, exactly 100 of each document type.
  All 500 source IDs are distinct. The database begins with zero canonical PDFs;
  final assertions require 500 READY documents and exactly 500 successful GENERATE
  attempts, proving that measured requests do not reuse warmed canonical outputs.
- The monotonic timer starts before the browser sends `POST /documents`. It ends
  after navigation to the production document page, a visible enabled Download PDF
  button, and a complete browser download. This deliberately includes navigation,
  rendering, automation and download overhead. The raw report also records the time
  until the download button becomes available.
- Every result checks HTTP 202/READY, matching source identity, HTTP 200 and PDF MIME
  type on content, successful download, PDF header/trailer and SHA-256 equality with
  the canonical document hash. No mocked or truncated PDFs count as success.

## Scope

This is the save/download path in Chromium on loopback, with one-line tickets,
ten-line loads, four-group daily cash closes and financial-summary reports. It does
not measure the OS share sheet, physical printing, remote network latency, very
large report layouts or the source-creation workflows. Document creation is initiated
through the authenticated browser API; visibility and download use the production UI.
Results apply to this recorded environment and workload.

## Reproduction

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:performance:documents
```

The default fixture starts disposable PostgreSQL 18 in Testcontainers. Alternatively,
set `TEST_POSTGRES_ADMIN_URL` to a dedicated local PostgreSQL 18 test server. The
existing harness checks localhost and the major version, creates a UUID-named
database and drops only that database afterward. Application `DATABASE_URL` is ignored.
`PLAYWRIGHT_BROWSERS_PATH` may point to an existing browser installation.
This explicit local-server option is enabled only by the T139 test; T138 retains
its existing requirement for a disposable Docker container.

The Playwright output contains `document-performance.json` and four final UI
screenshots, one for each document type. The raw report retains every source,
document ID, elapsed time, byte count, content hash, environment, seed and source-code
hash. Authentication credentials and session tokens are excluded.

## Integration verification

The final implementation reuses the T138 fixture published in remote commit
`e6ce81a`, including its cardinality and inventory-ledger checks. The original
search seed and default one-second spacing are preserved. The two T138 versions
were merged without discarding either branch's regression tests.

After integration, all 35 inventory contract, inventory UI, search-completion and
performance-profile tests passed. Lint, typecheck, generated-contract consistency
and the production frontend build passed. The T139 benchmark was rerun against
the integrated fixture; the raw report and metrics above describe that final run.

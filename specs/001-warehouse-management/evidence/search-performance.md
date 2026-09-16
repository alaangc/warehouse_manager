# T138 — Search performance acceptance

SC-006 passed on 2026-09-16 at 19:13:17 UTC: **450/450 (100%)** measured
searches completed within 2,000 ms; the required rate is at least 95%.

## Workload and measurement

- Seed: `warehouse-t138-v1`; exactly 10,000 products, 10,000 customers and
  100,000 COMPLETED sales, with 100,000 sale lines and immutable sale tickets.
  The fixture retains database constraints, inventory movements and sale audit events.
- 25 separate authenticated Administrator browser contexts, each with a distinct
  trusted-proxy client IP. Authentication, navigation and initial loading are outside
  the search measurement; rate limits remain enabled.
- 150 warmup actions, then 450 measured actions in 18 rounds of 25 concurrent
  searches. Each session rotates all three screens and matching/empty searches.
- Exactly 75 measurements for each of product matching, product empty, customer
  matching, customer empty, inventory matching and inventory empty.
- Every query is fresh within its session. Real API responses must return HTTP 200;
  there are no response mocks.
- Timing starts at the captured input event and ends after two animation frames
  where all four conditions hold: loading has ended; results or an explicit empty
  state are visible; identifying/relevant values render; all available result actions
  are visible and enabled (or no result actions exist for an empty response).
- All 450 samples assert all four conditions. No browser page errors occurred.

| Metric | Milliseconds |
| --- | ---: |
| p50 | 185.4 |
| p95 | 276.7 |
| p99 | 332.0 |
| Maximum | 389.7 |

The [raw report](./search-performance.json) retains every elapsed time, start timestamp,
query, user, result condition, mix count and environment field, plus SHA-256 hashes of
the test, fixture, built HTML and inventory endpoint. Its base commit is `6a603aa`;
the measured T138 working-tree changes accompany this evidence in the same commit.

## Environment

Windows 10.0.26200; AMD Ryzen 7 7445HS, 12 logical CPUs, 16,396,115,968 bytes RAM;
Node 24.18.0; pnpm 10.28.1; Chromium 151.0.7922.34; PostgreSQL 18.6 for Windows
(MSVC 19.44.35228, 64-bit). The frontend uses a Vite production build; API, database
and browser run locally over loopback. This result applies to this environment and
workload, not to remote-network or production latency.

## Reproduction

Install the pinned workspace dependencies and Chromium, then run:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:performance:search
```

By default the fixture starts a disposable PostgreSQL 18 container. Without Docker,
set `TEST_POSTGRES_ADMIN_URL` to a dedicated local PostgreSQL 18 test server, as
documented in the quickstart. The existing harness validates localhost and version,
creates a fresh UUID-named database and drops only that database on completion.
The application `DATABASE_URL` is ignored. This recorded run used that local mode.
The browser binaries were supplied through `PLAYWRIGHT_BROWSERS_PATH`.

The Playwright output directory contains the raw JSON attachment and screenshots of
matching and empty results on all three screens. Performance tests use a separate
configuration and are excluded from the ordinary functional browser suite.

## Regression coverage

Inventory search now executes in the authorized SQL query before the 100-row limit,
instead of searching only the downloaded rows. Contract coverage verifies a match
beyond that limit, Driver isolation, literal wildcard handling and the 200-character
bound. Component coverage verifies the search request and loading/ready states.
Product, customer and inventory result regions expose `aria-busy` for readiness.

Verification repeated on 2026-09-16: all 25 inventory API/component regression tests,
lint, typecheck, changed-source formatting, generated-contract consistency,
contract compatibility, the production frontend build and SC-006 acceptance passed.

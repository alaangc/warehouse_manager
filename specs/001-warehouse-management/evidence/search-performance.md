# T138 — Visible search performance (SC-006)

## Recorded result

SC-006 **PASS in this local environment**: 450/450 (100%) within 2,000 ms;
428 passes required. All 150 warm-up and 450 measured actions satisfied the four
completion checks. No retries or dropped samples; zero ledger mismatches.

| Search mix | Samples / passes | p50 ms | p95 ms | p99 ms | Max ms |
|---|---:|---:|---:|---:|---:|
| Products, matching | 75 / 75 | 269.6 | 403.5 | 418.5 | 418.5 |
| Products, no results | 75 / 75 | 279.6 | 407.1 | 429.0 | 429.0 |
| Customers, matching | 75 / 75 | 269.0 | 425.3 | 432.3 | 432.3 |
| Customers, no results | 75 / 75 | 287.4 | 428.9 | 454.1 | 454.1 |
| Inventory, matching | 75 / 75 | 310.1 | 458.6 | 513.1 | 513.1 |
| Inventory, no results | 75 / 75 | 288.1 | 429.1 | 458.3 | 458.3 |
| **All** | **450 / 450** | **285.9** | **418.5** | **458.3** | **513.1** |

Recorded September 16, 2026 (UTC), Apple M5 Pro / 18 logical CPUs / 48 GiB host RAM,
Darwin 25.6.0 arm64, Node 24.20.0, PostgreSQL 18.6 aarch64 Alpine, Chromium
151.0.7922.34 / Playwright 1.62.1. Exact timestamps and unrounded values are in the JSON.

## Reproduction and scope

From the repository root with Node 24, pnpm 10.28.1, Docker, and Playwright Chromium installed:

```bash
pnpm test:performance:search
```

The dedicated `playwright.performance.config.ts` runs one Chromium test, with 25
separate authenticated Administrator contexts/pages and unique real session cookies.
Each user runs one action at a time and immediately prepares the next; users run
concurrently. Six warm-up actions per user precede a common measurement barrier.
Eighteen measured actions per user produce 450 samples: exactly 75 each for matching
and no-results product, customer, and inventory searches. There are no test retries.

Timing starts at browser `performance.now()` immediately before filling the search
input. It includes automation dispatch, HTTP work, rendering, and result scrolling;
page navigation/initial loading before the search is preparation and is excluded.
The clock stops only when these conditions simultaneously hold:

1. The current input matches the requested query, the result region is no longer busy,
   and there is no visible error state (the gate rejects any alert).
2. The expected rows, or an explicit no-results message, are visible.
3. Visible identifying fields and relevant values match the fixture: product name,
   SKU, price and status; customer number, name, city and status; inventory product
   identity, location, quantity, availability and update year.
4. Every result action available to the Administrator is visible and enabled: product
   edit, customer selection, or inventory history. Empty results have no row actions.

Hidden field text, stale rows/input, loading, disabled actions, and errors cannot
satisfy completion. Unit tests exercise these negative cases. Failures remain in
the denominator, and the run also requires all 450 searches to complete correctly.
Percentiles use the nearest-rank method; SC-006 requires at least 428/450 completed
actions at or below 2,000 ms.

## Fixture and safety

Seed: `wm-perf-v1`. The committed SQL and profile generate stable names, identities,
queries, dates, and quantities. A fresh PostgreSQL 18 container is migrated and seeded
before each run. It contains exactly 10,000 products, 10,000 customers, and 100,000
completed sales, each with a line, ticket, audit event, inventory operation/movement,
and synthetic idempotency record. There are 20,000 balances (branch and route per
product). Entry/load/sale movement totals are checked against all balances; the run
requires zero mismatches. Foreign keys and history protections remain enabled.

This is an atomic bulk synthetic history fixture, not replay of 100,000 API sales.
Synthetic idempotency payloads do not establish replay/recovery correctness. Generated
auxiliary IDs, session credentials, and creation timestamps are not byte-for-byte
reproducible; the dataset cardinalities and search expectations are reproducible.
Transactional correctness and authorization remain covered by separate suites.

The fixture rejects `TEST_POSTGRES_ADMIN_URL`, ignores the application's database
configuration, and removes only its owned container and temporary storage. Real
credentials or development data are never imported into the recorded evidence.

## Environment and interpretation

Production Vite assets, Express, Chromium and Docker PostgreSQL run on the same host.
The test API uses development-mode HTTP on loopback, not production TLS. A test-only
ingress overwrites forwarding headers with 25 distinct documentation-range client
IPs; normal API/login rate limits stay enabled. This models separate proxy clients,
not 25 users behind a single NAT. It is not a production proxy configuration.

All contexts are Administrators to expose all three search surfaces and their result
actions. This is not a mixed-role benchmark, cold-start measurement, WAN/mobile-device
claim, or proof of production capacity. Concurrent background work and Docker resource
allocation affect results. Re-run on the intended deployment before capacity planning.

The raw [search-performance.json](search-performance.json) includes host/OS/CPU/memory,
Node/PostgreSQL/Chromium versions, timestamps, base revision and dirty-worktree flag,
seed, counts, all 150 warm-up samples, all 450 measured samples, mix and percentiles.
The recorded base revision precedes the uncommitted T138 changes tested in this commit.

## Inventory-search correction and review

The scale fixture exposed frontend-only filtering of the first 100 inventory balances.
Search is now validated and applied by the API before its response limit, preserving
Driver route scoping. A PostgreSQL-backed regression proves a matching item beyond
the original limit is returned and unassigned Drivers cannot see it. No new database
migration or business-history mutation was introduced. The optional OpenAPI search
parameter, generated contracts, and hash-bound compatibility note are synchronized.

The first profile also revealed ambiguous numeric inventory queries could match UUIDs;
matching inventory actions now use the full unique product name. Failed exploratory
runs are not presented as acceptance results, and checks were not relaxed to accept
extra rows. Subsequent hardening rejects hidden values and stale search inputs.

Constitution self-check: API remains authoritative; input validation and parameterized
queries preserve authorization boundaries; exact financial/history data stays intact;
the contract change and applicable regression checks are explicit. This report is not
independent human approval. Reviewer constitution/compatibility sign-off and remaining
release tasks are still required.

## Regression validation and known issue

- Search profile: 1 passed, including all 450 measured browser actions.
- Inventory browser workflow: 3 passed (Chromium, Firefox, WebKit).
- API contracts: 143 passed, including pre-limit search and Driver isolation.
- Unit/component suite: 340 passed, including seven DOM-completion negative/positive
  checks and two deterministic-profile/percentile tests.
- Formatting, lint, type checks, independent API/web builds, OpenAPI lint, runtime
  schemas, generated-contract drift and compatibility gates pass.
- Broader integration run: 193 passed, 4 failed in the existing user-settings suite
  with `Fixture login failed: 429`. That suite repeatedly logs into one shared server
  from one IP and hits T137's 30-login/minute limit. These files/security settings are
  unchanged by T138. The four affected cases pass when run together separately;
  the complete suite still needs a separate fixture-isolation correction. No rate
  limit was disabled or raised, and this run is not represented as an all-green release.

T139 PDF performance, T133 physical-printer acceptance, independent human review and
other outstanding release tasks are not satisfied by this report.

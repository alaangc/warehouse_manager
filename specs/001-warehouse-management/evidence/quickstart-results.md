# T144: Clean-environment quickstart verification

Executed 2026-09-17–18 (America/Hermosillo), based on
`0caa74041b31103906f508ac3c8278c8305861b1` plus the T144 changes in this commit.

## Scope and reproducibility

The isolated clone was `C:/stock_control/.tools/t144-clean-20260917`.
The initial install used a separate empty pnpm store, downloaded all 625 packages,
and completed with the frozen lockfile in 54.4 seconds. No working-tree application
data, populated environment files, build output, or node_modules were copied into
the clone. The initial bootstrap/static/migration logs from the interrupted session
were retained and inspected; the remaining checks were resumed in that clone.

Environment: Windows, Node.js 24.18.0, pnpm 10.28.1, Docker Engine 29.7.2,
PostgreSQL 18.6 (`postgres:18-alpine`). Browser binaries were reused from the local
Playwright installation. This is an isolated application/dependency/database run,
not a newly provisioned operating system. The final test-harness changes were copied
into the clone and checked there; production application code was unchanged.
The local Node patch release is within the declared `>=24 <25` engine range but
differs from `.nvmrc`/CI's 24.20.0; these results do not claim an exact CI-image replay.

Local execution logs, command exit codes/timestamps, and screenshots are under
`var/t144/`. The committed `quickstart-results.json` retains the command results and
failure classifications without copying credentials or session-bearing request logs.

## Bootstrap and static gates

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; separate empty store, 625 downloads |
| `pnpm db:test:up` | Passed; isolated clone's Compose test service on port 55432 |
| `pnpm db:migrate` | Passed; eight migrations |
| `pnpm db:seed` | Passed; foundation users/settings/branches |
| `pnpm dev` | API on 3000 and Vite on 5173; verified with agent-browser |
| Proxy health | `GET http://localhost:5173/api/v1/health`: 200, `{"status":"ok"}` |
| Login/data/UI | Seed Administrator login 200; routes, balances, overview 200; Spanish dashboard rendered; no browser errors |
| `pnpm format:check` | Passed after LF checkout normalization |
| `pnpm lint` / `pnpm typecheck` | Passed again after test isolation fix |
| `pnpm build` | All workspace builds passed |
| `pnpm contract:generate` | Passed with LF input; generated artifacts match committed content |
| `pnpm contract:lint` | Valid OpenAPI, final exit 0; initial Node shutdown failure retained below |
| `pnpm contract:check-diff` / `pnpm test:contract` | Both passed |
| `pnpm contract:runtime` | All request/response schemas compile under JSON Schema 2020-12 |
| `pnpm test:contract-gates` | Four tests passed |
| `pnpm contract:compatibility` | Passed against base `0caa740` |
| `pnpm security:browser` | Browser bundle and lockfile checks passed |

The dev server and browser were stopped after verification, before starting the
isolated E2E stack. The initial anonymous session probe's 401 was expected; it was
followed by successful login and authenticated data responses.

## Automated tests, migration, and recovery

Final suite results are recorded in the companion JSON.

- Unit/component suite: 348 passed in 37 files, using
  `pnpm test:unit --maxWorkers=2 --testTimeout=15000`.
- HTTP/API suite: 144 passed in 12 files, using
  `pnpm test:api --no-file-parallelism` and default disposable Testcontainers.
- Integration suite: 212 passed in 26 files after the per-test HTTP-state fix,
  using `pnpm test:integration --no-file-parallelism` (236.9 seconds).
- Browser suite: `E2E_ISOLATED_STACK=1 E2E_BASE_URL=http://127.0.0.1:5173 pnpm test:e2e --reporter=list,json`,
  one worker, no automatic retries, fresh Testcontainers database.
  Initial run: 39 passed, one Firefox customer timeout, two expected BLE skips
  (569.2 seconds). After the timeout-budget correction,
  `pnpm test:e2e us4-customers.spec.ts --reporter=list,json` passed in all engines
  (62.2 seconds). Final per-case coverage is Chromium 14 passed, Firefox 13 passed
  plus one expected skip, WebKit 13 passed plus one expected skip. This combines
  the full run and the focused verification; it is not described as one all-green run.
- `pnpm db:verify`: empty database, all eight migrations, repeat no-op,
  populated upgrade, immutable history fingerprints, old-command replay,
  failed-DDL rollback, and additive roll-forward compatibility passed.
- `pnpm db:recovery:test`: logical dump/restore passed; WAL PITR recovered to
  `0/4028798`, with before-target present, after-target absent, matching fingerprints,
  and original sale replay intact. Containers were disposable and cleaned up.

## Initial failures and corrections

1. Windows CRLF checkout caused 314 format failures and changed generated contract
   hashes. Adding `.gitattributes` alone did not rewrite existing files; the isolated
   clone's tracked text files were normalized to LF, then format and generation
   passed. Commit `.gitattributes` so fresh Windows clones check out the correct bytes.
2. The quickstart omitted API environment setup, used a test database service without
   its matching connection URL, overstated foundation seed contents, and did not
   select the isolated E2E fixture stack. The guide now supplies these steps and the
   separate document-performance command.
3. The first API run used an old localhost PostgreSQL URL whose server was stopped:
   11 suites failed setup with `ECONNREFUSED`, 17 tests passed, 127 skipped. The final
   run removed the override and used Testcontainers: all 144 passed.
4. Integration initially had 208 passes and four failures, all fixture-login 429s in
   the administration suite. Its single HTTP application retained IP login counters
   across 35 unrelated tests. The harness now exposes `resetHttp()` and this suite
   recreates HTTP state before each case while retaining its database and sessions.
   Production rate limits and same-case authentication throttling remain unchanged.
5. Recovery first hit the sandbox's Node user-info error, then Docker was found
   stopped. It passed outside that sandbox after Docker started. No failed run is
   counted as a recovery pass.
6. OpenAPI lint initially validated the schema but Node exited with Windows
   `UV_HANDLE_CLOSING` / `3221226505`. The retry exited 0 with
   `REDOCLY_TELEMETRY=off` and `NO_UPDATE_NOTIFIER=1`; the update banner still appeared,
   so these settings are not claimed to prove a root-cause fix.
7. `pnpm dlx agent-browser` downloaded the tool but rejected its pnpm >=11 engine
   requirement. The downloaded native executable completed the visual checks;
   the project's pinned pnpm was not changed.
8. Firefox's full customer walkthrough exceeded the 30-second whole-test budget
   (31.1 seconds) while other verification workloads were running. The test spans
   two authenticated browsers, fixture setup, customer-specific and standard pricing,
   sales, historical preservation, archival, and route closure. Its whole-test budget
   is now 60 seconds, as with the inventory walkthrough; action assertions and
   performance thresholds are unchanged. The affected walkthrough is rechecked in
   all three engines separately and the original failure is retained. The final
   Firefox run took 16.0 seconds and WebKit took 22.0 seconds without competing suites.
9. The first search-performance run could not serve SPA routes from a clone nested
   beneath `.tools`: Express `sendFile` treated the absolute path's hidden ancestor
   as a dotfile and returned 404. The performance fixture now serves the fixed
   `index.html` filename relative to its explicit build root. It does not allow
   dotfiles or change production serving behavior. The original invalid run is
   retained under `var/t144/search-performance-initial.json`; it is not performance
   acceptance evidence. Both profiles are executed with the corrected fixture.

Known non-blocking diagnostics include Kysely deprecated `orderBy` syntax, optional
dependency scripts ignored by pnpm, React update warnings, MUI empty-select-child
warnings, and tool update/color notices. These do not
replace the recorded exit codes or test assertions.

## Performance verification

Both profiles passed sequentially in the isolated clone with the corrected SPA
fixture and disposable PostgreSQL databases, without competing test workloads.

- Search (2026-09-17): 450/450 completed actions, 432 within two seconds against
  the required 428; p50 923.8 ms, p95 1967.7 ms, p99 2242.1 ms, max 2401.9 ms.
  The customer no-results subgroup had 71/75 within the limit; SC-006's aggregate
  gate passed. The subgroup is not claimed to independently meet 95%.
- Documents (2026-09-18): 400/400 measured downloads within ten seconds against
  the required 380; p50 3461.9 ms, p95 5389.9 ms, p99 5989.4 ms, max 6238.8 ms.
  Each of TICKET, ROUTE_LOAD, CASH_CLOSE, and REPORT contributed 100 measurements.
  All 500 distinct documents, including warmup, had successful uncached generation;
  browser errors were empty. The command exited 0 in 203.2 seconds.
- The initial document attempt failed before database setup because the sandbox
  could not access the container runtime. The subsequent run with Docker access
  passed; both command outcomes are retained in the companion JSON.

The companion JSON retains performance summaries and the document run's environment.
Raw local document measurements remain in the isolated clone's
`test-results/performance/`; search summaries are retained in
`var/t144/performance-search-fixed.log`.

## Acceptance boundaries

The automated inventory, customer/pricing/sale, route reconciliation/closure,
authorization/history, cancellation, reporting/cash-close, and portable-document
walkthroughs are covered by the API/integration/browser runs above. Simulated BLE
and browser download/share fallbacks do not establish actual device compatibility
or acceptance of a native OS sharing destination.

T144 remains **unchecked** because its full quickstart acceptance includes the
physical printer matrix and human usability sessions. No printer/firmware/OS matrix,
paper output, five Driver timings, or ten-participant first-attempt scores were
provided or fabricated. T133 and T141 remain pending; T145 reviewer traceability and
release sign-off is the next separate task. This record is not release approval.

See [printer acceptance](printer-acceptance.md), [usability protocol](usability.md),
and the [quickstart](../quickstart.md).

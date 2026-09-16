# Project continuation — T141 preparation, participants pending

## Current continuation (2026-09-16)

T141 preparation is recorded in evidence/usability.md: frozen U-SCRIPT-1,
U-FIXTURE-1-D/A and ten pending participant records. The owner explicitly chose
"Preparar protocolo; participantes pendientes". T141 remains unchecked; SC-003
and SC-009 have no human evidence. Continue with the remaining accessibility
audit and real sessions when participants are available, not with invented scores.
Reconciliation now validates required reasons and quantities before submitting,
compares equivalent decimal quantities correctly, and groups controls by product.
Seven new regression tests plus existing sale/route tests: 16 passed. Real route
keyboard/focus and 390px container-fit checks passed in all three browsers,
with final CLOSED/zero-stock verification. See usability.md for audit limitations.

T140 is complete. See evidence/cross-browser-e2e.md and its JSON report for the
complete three-engine suite and the inventory correction verification. Final case
results: Chromium 14 passed; Firefox and WebKit each 13 passed and one expected
Chromium-only BLE skip. Zero unresolved failures or automatic retries.
The first run hit WebKit's 30-second whole-test inventory budget; that walkthrough
now has 60 seconds and passed again in all three browsers (WebKit: 33.6 seconds).
The evidence preserves the initial failure and non-blocking React/MUI diagnostics.
T138/T139 performance evidence remains in search-performance.md and document-performance.md.
The next task is T141 (accessibility and human usability); continue one task at a time.
T141's human acceptance requires five Drivers and five Administrators; do not
substitute automated timings for participant results.
T133 still requires physical printer acceptance. The user authorized completing
this continuation and pushing to main at https://github.com/alaangc/warehouse_manager.git.

Do not include unrelated untracked Neon skills, skills-lock.json, output/, tmp/,
var/*.json, the unused print-job.ts or document-integration-fixtures.ts in this
task commit. For Windows component verification, a local --testTimeout=15000
override avoids intermittent five-second startup timeouts. CI defaults remain.
The existing local PostgreSQL test cluster uses the warehouse_test role; verify
its current port before setting TEST_POSTGRES_ADMIN_URL.

## Historical T119 handoff

T119 adds document and output-attempt history HTTP contracts using a shared disposable PostgreSQL fixture harness. Coverage includes four document/source pairs, portable PDF output, allowed print modes, Driver source authorization, canonical reuse, draft/report rejection, response shapes, paginated filtered history, scoped cursors and Administrator-only TEST_PRINT history.

No production implementation was added. Document/history endpoints remain the T123–T127 implementation boundary. See evidence/t119-contract-red-phase.md for coverage and reproduction commands.

## Verification (2026-09-11)

- New T119 suites: 58 tests, 4 passed, 54 expected failures, 0 skipped. Every failure is an absent route returning 404.
- Existing HTTP contract tests: 74 passed.
- pnpm lint and pnpm typecheck passed; changed tests formatted with Prettier.
- Source fixtures use existing HTTP business operations after initial fixture setup. No external database or printer used.
- Earlier T118 renderer/printer tests intentionally remain red pending T125/T128/T129.

## Next task: T120

Write the failing database constraint, history, authorization and output-isolation integration tests listed in tasks.md. Preserve source-derived authorization, immutable committed records and no side effects on rejected output requests.

## Branch and workflow

Development and pushes belong on main at https://github.com/alaangc/warehouse_manager.git. The demo/render-neon branch is for client demonstrations only. The user authorized committing and pushing this completed task to main. Continue one task at a time.

Untracked Neon skills, skills-lock.json, output/ and local var/t118-red.json, var/t119-red.json and var/t119-regression.json are unrelated source artifacts and must not be included in task commits.

## Windows environment

Use .tools/bin/pnpm.cmd with .tools/bin on PATH; PowerShell blocks pnpm.ps1. Docker Desktop is under LOCALAPPDATA/Programs/DockerDesktop and should launch hidden when needed. Testcontainers requires Docker access outside the sandbox.

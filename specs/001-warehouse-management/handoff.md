# Project continuation — T139 completed

## Current continuation (2026-09-16)

T139 is complete. See evidence/document-performance.md and its raw JSON report for
SC-007: 400/400 new PDFs downloaded within 10 seconds using 25 authenticated
closed-loop browser sessions. The benchmark reuses T138's population with sales
spaced 108 seconds apart for distinct nonempty daily cash closes and reports.
T138 evidence remains in evidence/search-performance.md.
The next task is T140 (critical cross-browser workflows); continue one task at a time.
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

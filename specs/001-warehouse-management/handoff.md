# Project continuation — T118 completed

## Latest completed task

T118 adds 37 failing unit tests for canonical PDF content snapshots, deterministic bytes/filenames/SHA-256, exact amounts, literal user text, all three ESC/POS templates, Spanish encodings, 58/80 mm wrapping, ordered/delayed chunks, disconnect ambiguity and explicit reprint confirmation.

No production implementation was added. The full test run is intentionally red until T125/T128/T129 implement the missing renderer, formatter and adapter print method. See evidence/t118-unit-red-phase.md for proposed test boundaries and reproduction commands.

## Verification (2026-09-11)

- T118: 37/37 expected failures caused by missing modules/methods.
- Existing API unit/frontend tests: 23 suites, 141 tests passed excluding the two T118 files.
- pnpm lint and pnpm typecheck passed.
- No database or physical printer needed for this unit-test task.

## Next task: T119

Write the failing OpenAPI/Supertest document and output-attempt history tests described in tasks.md. Do not implement the subsequent document production tasks in this test-only step.

## Branch and workflow

The user clarified that ongoing development and pushes belong on `main` in https://github.com/alaangc/warehouse_manager.git. The `demo/render-neon` branch is only for client demonstrations. T116, T117 and T118 were cherry-picked onto main without the demo deployment commit. Continue from main for T119 and subsequent tasks.

The user authorized pushing the completed tasks to main. Do not use the older demo destination or no-push instructions. Untracked Neon skills, skills-lock.json, output/ and var/t118-red.json remain unrelated work.

## Windows environment

Use .tools/bin/pnpm.cmd and put .tools/bin on PATH. PowerShell blocks pnpm.ps1. Docker Desktop is under LOCALAPPDATA/Programs/DockerDesktop; run hidden if needed for later Testcontainers tasks. Docker access required running outside the sandbox in T117.

# Project continuation — T150 audit gaps closed; T151 next

## Latest continuation (2026-09-18, T150)

T150 is complete; A1–A4 are closed in `evidence/constitution-compliance.md`.
See `evidence/t150-audit-coverage.md` for the 20 catalog lifecycle cases, six
inventory operation/reversal cases, three customer lifecycle cases, and strengthened
cash-close creation-audit assertion. Each new rollback case reaches a real rejected
audit insert and proves unchanged records; successful commands assert PostgreSQL
transaction identity. Customer cases also preserve an existing purchase.

The first run exposed three failures: customer audit after-values omitted changed
name/city. CustomerService now uses one explicit editable-field snapshot for creation
and both sides of updates, without rewriting old events. After the fix, 45 focused
integration tests and six customer HTTP contracts passed; lint/typecheck passed.
This is focused validation, not a fresh T144 full-suite/clean-clone run.

Next software task: **T151**, complete bilingual browser acceptance. Then T152
resolves startup schema readiness. T133/T141 real acceptance and the T144/T145 release
gates remain open. Continue one task at a time. Preserve unrelated untracked Neon
skills, scratch files, unused document/printer helpers and local `var/` logs.

## Latest continuation (2026-09-18, T145)

The reviewer traceability and constitution record is now
`evidence/constitution-compliance.md`, reviewed against `5f62c81`. It maps all
53 current FRs and 13 SCs (including the bilingual additions beyond T145's original
range), expands all five audit-matrix classes, and records a HOLD decision without
inventing human approval or approving exceptions. T145 remains unchecked.

Next software task: **T150**, closing audit evidence gaps for catalog lifecycle,
customer updates/lifecycle, every inventory operation/reversal, and the successful
cash-close creation event. Then T151 covers complete bilingual browser acceptance;
T152 resolves the plan's promised schema-readiness check (current startup validates
environment only, and health runs `select 1`). Each task has concrete closure
criteria in tasks.md and the review record. Continue one task at a time.

T133 physical printer acceptance and T141 real participants/remaining accessibility
remain pending; T144 cannot be fully accepted until these gates pass. Review and
release approval must be refreshed after remediation. This continuation changes
documentation only and relies on the retained T144 execution baseline, not a fresh
application-suite run. Preserve unrelated untracked files; commit/push only this review.

## Latest continuation (2026-09-17, T144)

Closed automated verification on 2026-09-18: search passed with 432/450 actions
within two seconds; documents passed with 400/400 downloads within ten seconds
(p95 5389.9 ms). The document run's initial sandbox/container-access failure and
successful Docker-enabled retry are retained. T133/T141 acceptance remains pending.

The clean-environment quickstart run and its initial failures are recorded in
`evidence/quickstart-results.md` and the companion JSON. The verification uses the
isolated clone at `.tools/t144-clean-20260917`, based on `0caa740` plus the T144 fixes.
The quickstart now supplies the test database URL, API environment setup, shared
contract build, actual seed scope, isolated E2E variables, and both performance commands.
`.gitattributes` fixes LF checkout reproducibility on Windows. Administration
integration tests recreate HTTP state per case so shared login counters cannot leak
between cases; production limits are unchanged. The long customer E2E workflow has
a 60-second whole-test budget with its existing per-action assertions intact.
The performance fixture resolves its SPA entry relative to the build root, allowing
clean clones under a hidden ancestor such as `.tools` without permitting dotfiles.

T144 remains unchecked because the complete quickstart includes T133 physical
printer acceptance and T141 real participant sessions. Do not mark these passed
from software tests or simulated BLE. T145 traceability/reviewer release sign-off
is the next separate task; release approval still requires these acceptance gates.
Use Docker/Testcontainers for new automated runs: the earlier local PostgreSQL
server on port 5432 was stopped during this continuation.

Only task-related files belong in this commit. Preserve the unrelated untracked
Neon skills, scratch outputs, unused printer/document helpers, and `var/` logs.

## Current continuation (2026-09-17)

T142 is implemented: allowlisted operational failure logs, request correlation,
transaction retries/exhaustion, authentication, cash-close conflicts, history cursor
rejection, committed document failures, and failed/uncertain printer attempts.
See evidence/failure-signals.md for verification and event-count interpretation.
T141 additionally fixes the sale quantity input's decimal hint and invalid-field
focus; 16 component tests pass. Human sessions and the remaining wider accessibility
audit are still pending, so T141 remains unchecked. No participant data was invented.

T143 adds CI dependency audit, installed-license inventory, paid MUI rejection,
and browser bundle secret/canary scanning. qs was pinned to 6.16.0 to resolve two
moderate advisories; the final registry audit reports zero vulnerabilities.
See evidence/security-scanning.md. Next task: T144 clean-environment quickstart
verification; do not mark its physical/human acceptance steps passed without evidence.
T133 still requires real printer acceptance. The dedicated local PostgreSQL test
cluster was restarted on port 5432 (warehouse_test role); use fresh disposable
databases via TEST_POSTGRES_ADMIN_URL and --no-file-parallelism.

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

# Project continuation — T117 completed

## Latest completed task

T117 completes the PrinterAdapter boundary, Web Bluetooth connect/test/disconnect implementation, personal printer selection and role overview UI. Settings expose approved active profiles and actor-scoped preferences. Device handles remain in the browser. Tests require API acceptance before physical writes, append STARTED and terminal attempts, and never automatically repeat uncertain writes or writes whose result could not be saved. Connection cleanup covers unmount, profile changes and remote disconnection.

## Verification (2026-09-11)

- Frontend: 15 suites, 100 tests passed.
- pnpm typecheck and pnpm lint passed.
- Prettier check passed for the new adapter, views and focused tests.
- Chrome E2E: 2 tests passed using disposable PostgreSQL 18/Testcontainers and simulated BLE. Covers account authorization/revocation and Driver connect/test/preference persistence, durable attempt records, no browser page errors and mobile overflow checks. Mobile screenshot visually inspected.
- Initial E2E setup failed because Docker was unavailable; starting Docker Desktop and running outside the sandbox resolved it.
- Physical printer compatibility and Firefox/WebKit E2E were not verified in this session. Hardware gates remain separate.

## Next task: T118

Write the failing document renderer and printer adapter tests described in tasks.md. Business document printing and ESC/POS templates remain T128/T129 scope.

## Windows environment

Use `.tools/bin/pnpm.cmd` and put `.tools/bin` on PATH for child commands. PowerShell blocks the pnpm.ps1 shim. Docker Desktop is under LOCALAPPDATA/Programs/DockerDesktop; launch hidden if needed. Testcontainers requires Docker access outside the sandbox.

E2E command: `pnpm.cmd exec playwright test tests/e2e/us7-user-settings.spec.ts --config var/us7-playwright.config.ts`.

## Working tree / workflow

One task per session; commit task changes without pushing. Untracked Neon skills, skills-lock.json and output/ are unrelated existing work and must not be included in the T117 commit.

# T115: Administrator user and business settings screens

Verified on 2026-09-09 (America/Hermosillo) with Node.js 24.18.0, pnpm 10.28.1,
Playwright 1.62.1 and disposable PostgreSQL 18 containers.

## Implemented behavior

Administrators can search/filter/page through users, create accounts, edit display
names and roles, activate/deactivate accounts, and replace passwords. Blank edit
passwords are omitted. Deactivation requires a reason; explanatory text covers
active-route restrictions, revoked sessions and preserved historical attribution.
Drivers cannot load these administrative screens or fetch business settings.

Business settings accept currency, timezone and a reason using shared request
schemas and optimistic versions. The screen explains future-only configuration
changes and fixed financial rules. Loading, retry, validation and API errors are
visible, with English/Spanish text and preserved form contents across language changes.

Conflicts retain edits until an explicit discard/reload. T115 completion fixes a
reload that previously retained user edits when the returned version was unchanged,
displays canonical values returned by a successful settings update, prevents reload
during an in-flight save, and avoids retrying an expired cursor while resetting pages.

## Verification

- Regression red phase: two new tests failed for retained user edits after reload and
  an untrimmed timezone remaining visible after save. Both pass with the fixes.
- Administration component tests: **13 passed**, including creation, denied Driver
  access, deactivation reasons, role/password changes, reactivation, pagination,
  English/Spanish switching, conflicts, explicit reload and updated settings versions.
  The six existing printer tests belong to pending T117 and were excluded by name;
  they were not removed or marked skipped in source.
- Administration HTTP contracts and overview PostgreSQL integration: **37 passed**,
  using disposable containers and all existing migrations.
- T115 browser flow: **3 passed** in system Chrome (Chromium project), Playwright
  Firefox 1538 and WebKit 2336. Each checks creation, persisted deactivation,
  Driver UI/API denial, revoked Driver sessions, a real two-tab settings conflict,
  explicit reload, persisted settings, desktop/mobile layouts and no page errors.
- TypeScript workspace checks, workspace ESLint, API/web builds, modified-file
  Prettier and `git diff --check` passed. The existing web bundle-size warning remains.
- React/constitution review: hooks are unconditional within role-gated children;
  actor-specific query keys and component identities isolate users; forms retain
  drafts without effects overwriting them; requests are cancellable and mutations
  are not automatically retried. Controls have labels and responsive layouts.
- agent-browser with local Chrome verified Spanish navigation and user controls.
  Desktop/mobile screenshots were visually inspected for readable labels, controls
  and layout; browser assertions checked horizontal overflow at 390px width.

The ordinary Playwright installer initially lacked browsers and its Chromium download
stalled. Firefox/WebKit were downloaded from the official Playwright CDN into ignored
`.tools/playwright`, with Winldd 1007. An ignored temporary Playwright configuration
used the installed Chrome channel; no project dependency or committed test
configuration was changed. API tests needed execution outside the restricted sandbox
to access the local Docker runtime.

## Reproduction

```powershell
$env:PATH = 'C:\stock_control\.tools\bin;' + $env:PATH
corepack pnpm exec vitest run --config vitest.workspace.ts apps/web/tests/users/user-settings-ui.test.tsx -t 'T115|creates a Driver|shows .* without discarding|submits business|denies direct Driver'
corepack pnpm exec vitest run --config vitest.workspace.ts apps/api/tests/contract/users/user-settings.contract.test.ts apps/api/tests/integration/users/overview.test.ts
# With the standard Playwright browsers installed:
$env:E2E_ISOLATED_STACK = '1'
corepack pnpm exec playwright test tests/e2e/t115-administration.spec.ts
```

The recorded E2E run used `tests/e2e/support/start-isolated-stack.ts` in a separate
process, `E2E_SKIP_SERVER=1`, `PLAYWRIGHT_BROWSERS_PATH=C:\stock_control\.tools\playwright`
and `--config .tools/t115-playwright.config.ts` for the Chrome channel override.

## Visual evidence

- [Desktop user editor](t115/users-desktop.png)
- [Mobile user editor](t115/users-mobile.png)
- [Mobile business settings](t115/settings-mobile.png)

## Constitution and scope

The documented HTTP API remains authoritative for authorization, validation, audited
transactions, deactivation guards and session revocation. The browser does not access
the database or calculate financial values. No migrations, contract changes or
historical rewrites were required. UI and end-to-end deny/conflict/persistence checks
cover this task's boundaries. T116 printer profiles, T117 printer/overview UI and
release-wide gates remain pending; completing T115 does not mark US7 complete.

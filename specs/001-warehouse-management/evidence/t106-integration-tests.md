# T106: Administration integration tests

Verified on 2026-09-07 with Node.js 24.18.0, pnpm 10.28.1, and an isolated
Testcontainers PostgreSQL 18 database. The development database was not modified.

## Scope

The 35 cases in `apps/api/tests/integration/users/user-settings.test.ts` cover:

- User creation, editing, activation, deactivation, role changes, and password
  rotation; safe audit snapshots and Argon2id verification.
- Revocation of multiple sessions, denied reuse of old cookies, and future login
  behavior after security-sensitive changes.
- Driver deactivation/role conflicts and vehicle deactivation conflicts in
  PREPARING, EN_ROUTE, and RETURNED routes; database-enforced non-overlapping
  active Driver and vehicle assignments.
- Preservation of committed sale, line, ticket, inventory movement, and actor
  audit history after deactivation, including restrictive user foreign keys.
- Business settings audited against their stable singleton identity.
- Printer creation, editing, archival, retained output attempts, rejection of new
  use of an archived printer, and restrictive printer foreign keys.
- Per-user preference isolation, replacement without duplicate rows, and rejection
  of attempts to select another user through the request body.
- Audit presence and rollback-on-audit-failure for user, business-setting,
  printer-profile, and preference mutations. PostgreSQL `xmin` verifies that
  mutations and audits commit in the same transaction. A trigger with a
  nontransactional sequence proves an injected audit failure was actually reached,
  rather than accepting an unrelated HTTP 500 as rollback evidence.

## Commands and observed results

From PowerShell, with Docker Desktop running:

```powershell
$env:Path = "$PWD\.tools\bin;$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"
pnpm.cmd exec vitest run --config vitest.workspace.ts --project api-integration apps/api/tests/integration/users/user-settings.test.ts
pnpm.cmd exec eslint apps/api/tests/integration/users/user-settings.test.ts --max-warnings=0
pnpm.cmd exec prettier --check apps/api/tests/integration/users/user-settings.test.ts
pnpm.cmd typecheck
```

- **Integration: 5 passed, 30 failed, 0 skipped.** Exit code 1 is expected for
  T106's red phase. All failures are assertions receiving HTTP 404 from pending
  administration routes: 8 expect 201, 7 expect 200, 8 expect 500 from injected
  audit failures, and 7 expect 409 conflicts. No setup, import, database startup,
  or migration failures remain.
- The five passing cases verify existing vehicle deactivation guards in all three
  active states and active Driver/vehicle assignment uniqueness.
- **ESLint and Prettier: passed.**
- **Workspace typecheck: passed.** This existing command checks production source;
  tests are executed/transformed by Vitest. An additional temporary test-inclusive
  TypeScript check exposed pre-existing type issues in the shared administration
  harness (`Kysely<unknown>`) and sales factory (missing typed user `id`); those
  helpers were not changed by T106.

T106 completes test authoring, not the US7 implementation gate. The assertions
after missing routes remain unexercised until T109–T114 are implemented. No tests
are skipped, marked as expected failures, or changed to accept missing features.
T107 remains the next task. No extension hooks are configured.

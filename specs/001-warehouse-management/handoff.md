# Project continuation — T112 completed

## Latest completed task

T112 implements `apps/api/src/modules/printers/printer-settings-service.ts`:
- Validated profile creation, full metadata updates, optimistic versions, mandatory archival reasons, active-only listing by default, and retained archived history.
- Preferences are scoped exclusively by the authenticated context actor, with safe metadata and server timestamps. No browser device handles are accepted.
- Profile and preference changes write PRINTER_SETTING_CHANGED audit events in the same Serializable transaction.
- TEST_PRINT accepts only a strict document-free payload and an active approved profile; stores append-only attempts with server actor/request identity and concurrent attempt numbering. It does not change business records or contact a physical printer.

## Verification

- Initial focused test run failed because the service did not exist.
- Final PostgreSQL 18/Testcontainers service suites: 6/6 passed (3 printer-service tests plus 3 existing administration-service tests).
- Coverage includes concurrent numbering, preference isolation, profile version conflicts, archival and reactivation, retained attempts, rejection of document-bearing test requests, same-transaction audit identity via xmin, and rollback of creation/edit/archive/preference insert/update when audit insertion fails.
- `pnpm typecheck` and `pnpm lint` passed; changed TypeScript files formatted with Prettier.
- Constitution check: backend validation, Serializable writes, immutable attempts/history, safe configuration audits, and audit-failure rollback retained. HTTP authorization remains the explicit T113 boundary, matching the existing internal administration services.

## Next task: T113

Wire users/settings/printers/overview Zod contracts, routes, resource policies, role-filtered responses and the TEST_PRINT request variant. The T105/T106 HTTP suites still depend on this wiring; they are not claimed green by T112.

Internal service API: `create`, `update`, `get`, `list(includeArchived = false)`, `getPreference(actorId)`, `setPreference(input, context)`, `recordTestPrint(input, context)`. Context must come from the authenticated session. Restrict profile mutations and archived listing to Administrators. Unset preference currently returns null; reconcile the no-preference HTTP response with the OpenAPI contract during T113.

## Windows environment

Use `.tools/bin/pnpm.cmd` and put `.tools/bin` on PATH for pnpm child commands. Git Bash at `C:/Program Files/Git/bin/bash.exe` runs the prerequisite script; the default WSL bash was unavailable. Docker Desktop is installed under LOCALAPPDATA/Programs/DockerDesktop and was started for disposable PostgreSQL tests. Docker access required sandbox escalation.

## Working tree / workflow

One requested task per session; commit task changes without pushing. Existing README edits, `.tools/`, `var/t107.json`, and `var/us7-playwright.config.ts` belong to earlier work and are outside T112.

# T152: Database schema readiness

Verified 2026-09-20 on Windows with local PostgreSQL 18, using a fresh UUID-named
database owned and removed by the integration harness. Docker was unavailable;
the documented `TEST_POSTGRES_ADMIN_URL` localhost fallback was used.

## Behavior and boundary

`startServer` verifies migration compatibility before opening a listener and closes
its database pool if startup fails. `main.ts` emits a safe diagnostic and exits 1
on failure. `/api/v1/health` repeats the same check on every request and retains
the existing safe `NOT_READY` 503 response. Neither path applies migrations or
creates migration metadata.

The complete ordered set in `public.kysely_migration` must equal the migration
names in the reviewed `database/migrations/checksums.json`. Unknown future
migrations, missing middle entries and stale histories are rejected. The manifest
must accompany the deployed API; the runtime account requires SELECT on the
migration table. Source and compiled module paths resolve the same manifest.

This is migration-version compatibility. It does not certify arbitrary manual DDL
changes or compare database-stored migration checksums: Kysely stores names and
timestamps. Reviewed migration-file integrity remains the separate migration gate.

## Executed verification

- Initial red run failed because the readiness module did not exist.
- Final focused run: **9/9 tests passed**, across `database-readiness.test.ts`
  (5 integration tests) and `foundation/auth-errors.contract.test.ts` (4 contract tests).
- Empty database: readiness and startup reject; no public tables are created.
- Foundation-only schema: readiness and startup reject; migration history stays unchanged.
- Current schema: check succeeds inside a read-only transaction; the actual startup
  listener serves health 200 and closes cleanly.
- Latest/middle history entries removed, or unknown migration added: readiness and
  startup reject; health recovers to 200 after fixture restoration.
- Lost connectivity: safe 503 response without internal errors.
- Workspace typecheck and lint passed. API compilation passed.

Command:

```text
pnpm exec vitest run --config vitest.workspace.ts --project api-integration --project api-contract apps/api/tests/integration/database-readiness.test.ts apps/api/tests/contract/foundation/auth-errors.contract.test.ts --no-file-parallelism
```

C1 is closed. This focused verification does not replace T133 physical printing,
T141 human usability, T144 release-candidate replay, or T145 release approval.

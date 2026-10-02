# T123 and T124 Validation

Validated on 2026-09-12 with Node.js 24.18.0 and PostgreSQL 18.6. Each integration
suite created and cleaned up its own database on a dedicated local test server.
The server binaries and cluster are local tools excluded from Git.

## T123

```powershell
pnpm exec vitest run --config vitest.workspace.ts --project api-integration apps/api/tests/integration/documents/document-output.test.ts -t '^(?!.*rolls back failed output creation)'
pnpm exec vitest run --config vitest.workspace.ts --project api-integration apps/api/tests/integration/documents/document-migration.test.ts apps/api/tests/integration/database-migrations.test.ts --no-file-parallelism
```

Results: 34 constraint tests, 2 recovery tests, and 6 general migration tests passed.
The one excluded HTTP retry test depends on T126-T127. Recovery tests prove an empty
document schema can be reversed and reapplied, while existing history prevents
rollback and remains intact.

## T124

```powershell
pnpm exec vitest run --config vitest.workspace.ts --project api-integration apps/api/tests/integration/documents/document-repositories.test.ts
pnpm exec vitest run --config vitest.workspace.ts --project api-unit apps/api/tests/unit/shared/scoped-cursor.test.ts apps/api/tests/unit/documents/document-repository-validation.test.ts
```

Results: 17 integration tests and 20 unit tests passed. Coverage includes immutable
source snapshots, concurrent canonical reuse, permitted and denied source access,
rejection without persisted changes, TEST_PRINT visibility, print capability checks,
25-item defaults, cursor binding and tamper rejection, and exact PostgreSQL
microsecond ordering with UUID ties.

## Review

API typecheck and focused ESLint passed. Review confirmed that authorization stays
in API repositories, monetary values come from persisted snapshots, database
constraints enforce source validity, and denied operations preserve output and
business records. No applied migration was edited. HTTP document generation,
streaming, and route-level acceptance remain assigned to T126-T127.

For a Docker-free run, set `TEST_POSTGRES_ADMIN_URL` as documented in
[quickstart.md](./quickstart.md). Otherwise the harness uses Testcontainers.

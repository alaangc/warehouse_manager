# T126 Validation

Completed on 2026-09-12 using Node.js 24.18.0 and isolated PostgreSQL 18.6 databases.

## Behavior

`DocumentService.request(principal, source, requestId)` validates and authorizes the
committed source before canonical creation or reuse. It rejects construction with
an active transaction, leaving source business transactions outside generation.
The source version plus `pdf-v1` identifies the canonical template version.

The service commits a PENDING document before acquiring a document row lock for
generation. Requests await generation; concurrent service instances share the
database lock and reuse READY output. Rendering/storage failures produce FAILED
with a safe error code. Document state and its terminal GENERATE attempt commit
together. A failed database transaction leaves recoverable PENDING state.

`status` enforces source-derived access. `content` provides the same authorized PDF
bytes for download and Web Share, with a stable filename and content type. Files
use UUID/hash keys, temporary writes and atomic rename. Reads verify the storage
boundary and SHA-256 hash. Missing/corrupt files are rejected and regenerated on
an explicit request. Storage is private to the API.

A crash or database failure after rename may leave an unreferenced canonical file;
it is not served until READY is committed and is reused/replaced on retry. This
keeps the source transaction intact without pretending filesystem and PostgreSQL
commits form a distributed transaction.

## Tests

The new suite first failed because the service module did not exist. After
implementation, these commands passed with `TEST_POSTGRES_ADMIN_URL` pointing to
the dedicated local PostgreSQL test server:

```powershell
pnpm exec vitest run --config vitest.workspace.ts --project api-integration apps/api/tests/integration/documents/document-service.test.ts apps/api/tests/integration/documents/document-repositories.test.ts apps/api/tests/integration/documents/document-migration.test.ts --no-file-parallelism
pnpm exec vitest run --config vitest.workspace.ts --project api-unit apps/api/tests/unit/documents apps/api/tests/unit/shared/scoped-cursor.test.ts
pnpm --filter @warehouse/api build
pnpm exec eslint apps/api/src/modules/documents/document-service.ts apps/api/src/modules/documents/pdf-renderers.ts apps/api/tests/integration/documents/document-service.test.ts --max-warnings=0
```

- 38 integration tests passed, including 19 new service tests.
- 45 unit tests passed, including renderer and cursor regressions.
- API typecheck/build, focused lint, formatting, and diff checks passed.

Service cases cover all four PDFs, concurrent reuse, permitted and denied source
access, DRAFT rejection, generation/storage failures, retry and abandoned PENDING
recovery, corrupt/missing files, substituted storage keys, persistence failures,
atomic attempt/state rollback, invalid input, and unchanged business snapshots.

## Scope and Review

Review confirmed API-owned authorization, immutable financial inputs, committed
source isolation, transactional attempt/state persistence, and rejection before
output side effects. No applied migration or business ledger was changed.
HTTP schemas, serialization, streaming headers, and route-level acceptance remain
T127; this task validates the service directly without marking those routes done.

# T127 HTTP Validation

Completed on 2026-09-12 with Node.js 24.18.0 and isolated PostgreSQL 18.6 databases.

## Behavior

The document router exposes creation, status, private PDF content, document history,
and output-attempt list/detail/creation. Shared Zod schemas validate the four source
pairs, bounded history queries, public responses, and separate portable, thermal,
and TEST_PRINT request shapes. Exported inferred types are available to the client.
The reviewed OpenAPI already defines these operations; regeneration produced no
semantic changes.

Every document access resolves source authorization. Driver access cannot derive
from output creator, attempt actor, or possession of an ID. Authorization precedes
printer capability checks. DRAFT loads return 409; Administrator REPORT printing
returns 422; denied sources return 403 without accepted output or stored files.
TEST_PRINT remains available to both roles but its history is Administrator-only.

Mutation keys bind actor, operation and request content. Document requests retain
canonical retry/recovery behavior and return current state. Attempt retries replay
the original response; attempt insertion and replay persistence are one Serializable
transaction. Reusing a key for different content returns 409. The existing printer
client now sends the required keys for each recorded outcome.

PDF responses use application/pdf, stable attachment filenames, private/no-store
caching, and nosniff. Public metadata excludes internal storage keys and database
projection columns. Error text supplied by clients is normalized to a safe code,
and request IDs come from server request context.

## Evidence

Before implementation, four generation contract cases failed with 404 instead of
202. Following implementation, 208 tests passed:

- 36 document HTTP contract tests.
- 147 history, document integration, and user/settings regression tests.
- 5 new HTTP idempotency, authorization-order and response-boundary tests.
- 20 printer preference/profile component tests.

```powershell
pnpm exec vitest run --config vitest.workspace.ts --project api-contract apps/api/tests/contract/documents/documents.contract.test.ts --no-file-parallelism
pnpm exec vitest run --config vitest.workspace.ts --project api-contract --project api-integration apps/api/tests/contract/documents/document-history.contract.test.ts apps/api/tests/integration/documents apps/api/tests/contract/users/user-settings.contract.test.ts --no-file-parallelism
pnpm exec vitest run --config vitest.workspace.ts --project api-contract apps/api/tests/contract/documents/document-retry.contract.test.ts --no-file-parallelism
pnpm exec vitest run --config vitest.workspace.ts --project web apps/web/tests/printers/printer-preference.test.tsx apps/web/tests/printers/printer-profile-ui.test.tsx
pnpm contract:generate
pnpm contract:lint
pnpm contract:check-diff
pnpm build
```

Database runs used `TEST_POSTGRES_ADMIN_URL` as described in the quickstart.
HTTP fixtures now allocate and clean their own temporary document directory instead
of using a shared Unix-specific path. API typecheck, focused ESLint, formatting and
diff checks passed. Full workspace build passed with the existing large web bundle
warning (over 500 kB).

## Review

Review confirmed API authority, source-scoped authorization, strict contract
serialization, retry isolation, and preserved business/audit records. No migration
or historical business record was changed. T128 and later printing/UI work remains
pending; no claim is made about physical printer or full document-browser E2E
acceptance in this task.

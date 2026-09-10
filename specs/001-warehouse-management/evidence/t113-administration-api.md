# T113: Administration HTTP boundary

Verified on 2026-09-09 with Node.js 24.18.0, pnpm 10.28.1 and disposable
PostgreSQL 18 containers through Docker Desktop.

Implemented authenticated administration routes, Administrator-only user/business
settings/printer mutations, strict shared request schemas, safe response validation,
optimistic conflict/domain error mapping, contract-compatible user timestamps and
pagination, actor-owned printer preferences, approved-printer TEST_PRINT requests
without documents, and SQL-scoped active routes/permitted actions in the overview.
Driver printer lists omit archived profiles; Administrator lists retain them.
OpenAPI now permits a null printer preference before the first selection.

T114 remains pending for the dedicated overview query/service composition and
operational aggregates. No fabricated aggregate values are returned by T113.

## Validation

- Before route implementation: 13 expected HTTP failures (missing routes) and
  21 passing authentication/CSRF/contract checks.
- Administration unit, contract, integration and foundation contract suites:
  **7 files, 88 tests passed**. Covers audit rollback, session revocation,
  configuration invariants, concurrency, safe errors and access policies.
- Final administration contract run after adding populated foreign/assigned route
  assertions: **35 tests passed**. Includes malformed identifiers/query values,
  filter-bound cursor traversal, archived-printer visibility, and rejected attempts
  to broaden actor scope through input.
- Workspace lint, TypeScript checks, API/web builds, OpenAPI lint, semantic contract
  comparison and git diff whitespace checks passed.
- Prettier checks for all modified TypeScript files passed. Repository-wide
  `format:check` reports 196 unchanged files; this existing formatting debt is outside
  T113. The web build also reports its existing large bundle warning.

## Constitution review

The API retains authority for authentication, roles, validation and persistence.
Mutations delegate to the existing transactional, audited services. User responses
omit credentials; Driver projections filter at the database boundary. TEST_PRINT
records output only and never creates a business document or repeats a sale.
No migration or financial arithmetic changes were required. Request/response and
authorization tests cover the added HTTP boundary. The global release gates remain
in T134-T145; this evidence records completion of T113 only.

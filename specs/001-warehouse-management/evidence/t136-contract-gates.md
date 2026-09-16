# T136 - Strict contract gates

Validated on 2026-09-15 using Windows, Node 24.18.0, pnpm 10.28.1,
Docker 29.7.2 and disposable PostgreSQL 18 containers.

## Implementation

- Redocly recommended-strict validates OpenAPI. Only the public license
  requirement is disabled for this private application.
- Generation produces the reviewed OpenAPI copy, complete operation/schema types,
  and a version/hash stamp. Freshness checks do not overwrite stale files; CI
  additionally regenerates and rejects a Git diff.
- AJV compiles every request/response schema. The HTTP suite validates all
  responses and successful requests, including parameters, headers, Problem
  Details, empty responses and PDF bytes. Rejected invalid requests remain valid
  negative tests.
- Semantic compatibility hashes ignore editorial prose but preserve schema
  property names and literal values. Non-editorial changes require a hash-bound
  migration note against the actual event base. The gate checks documentation,
  not human approval or complete JSON Schema subtyping.
- API projections match the reviewed camelCase contract; PostgreSQL DATE values
  retain calendar-date strings. Quotes retain quantity and add requestedQuantity.
  The compatibility note records a coordinated migration for consumers of raw
  database columns previously exposed by catalog and inventory responses.
- Migration verification normalizes CRLF before hashing without changing migrations
  or approved checksums. Generated OpenAPI intersections have a narrowly scoped
  duplicate-type lint exception.

## Verification

- Strict OpenAPI lint, schema compilation, freshness and compatibility gates pass.
- Four gate tests pass, including stale artifacts, malformed messages, required
  headers, response media/status, semantic changes and stale review hashes.
- HTTP contract tests: 142 passed across 11 files, no skipped tests.
- PostgreSQL integration tests: 197 passed across 25 files, no skipped tests.
- Typecheck, lint, API build and web production build pass.
- Unit/component tests: 310 passed across 33 files with --testTimeout=15000.

## Limits

Initial tests required Docker Desktop to be started. Windows sandbox execution of
tsx failed in os.userInfo; successful runs used the approved unsandboxed toolchain.
The default five-second component timeout was exceeded intermittently under local
load; verification uses a 15-second command-line timeout without changing CI's
defaults. Repository-wide formatting encounters pre-existing checkout line endings
and an unchanged apps/web/index.html warning; task files are checked separately.
The existing Vite bundle-size warning remains. Hosted CI, physical printers,
cross-browser release acceptance and release approval are not claimed by this task.

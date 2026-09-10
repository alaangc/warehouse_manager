# T114: Role-specific operational overview

Verified on 2026-09-09 using Node.js 24.18.0, pnpm 10.28.1 and disposable
PostgreSQL 18 containers.

The dedicated overview service and router replace the initial T113 projection.
Administrators receive all open routes, permitted actions, an exact all-time sum of
completed (not cancelled) sales, and the count of active product/active branch pairs
at or below the product threshold. Missing balances mean zero. Route inventory and
inactive products/branches do not contribute to the alert count.

Drivers query only their own open routes and receive permitted actions. Their request
does not execute organization-wide sales or inventory aggregates. Repeatable-read
transactions provide a consistent snapshot for the Administrator's multiple queries.
Separate strict response schemas enforce the selected role's shape. OpenAPI documents
both shapes and the aggregate definitions; decimal totals never pass through Number.
The existing role-composition helper is reused and excludes closed routes.

## Verification

- Red phase: the two new integration tests failed because aggregates were absent.
- Final run: 43 tests passed in three files (overview PostgreSQL integration,
  administration HTTP contracts, and administration domain unit tests).
- Covered empty data, exact 0.10 + 0.20 totals, cancellation exclusion, absent and
  threshold-equal balances, above-threshold balances, archival, assigned versus foreign
  routes, closed routes, role-specific fields, authentication and invalid query filters.
- Workspace lint, typecheck, API/web builds, OpenAPI lint, contract semantic comparison,
  modified-file Prettier checks and git diff whitespace validation passed.
- One intermediate retry timed out while starting the test containers; Docker status
  was checked and the final unchanged test run passed in 10.99 seconds.
- Existing repository-wide formatting debt recorded under T113 and the existing web
  bundle-size warning remain outside this task.

## Constitution review and scope

The API remains authoritative for authorization, query validation and resource scope.
SQL performs exact monetary aggregation; a read-only workflow introduces no business
mutations, audit changes, migrations or historical rewrites. Separate response schemas
and HTTP/integration tests verify role isolation. OpenAPI was refined from an untyped
overview object to the implemented role-specific shapes; existing routes/actions remain
compatible. Frontend overview integration is still T117. Release-wide acceptance and
performance evidence remain in their planned tasks.

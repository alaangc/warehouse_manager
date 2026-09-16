# T137 - HTTP security hardening

Validated 2026-09-15 on Windows, Node 24.18.0 and pnpm 10.28.1.

## Implemented

- Central security middleware uses an explicit proxy IP/CIDR allowlist, rejects
  production plaintext business requests, and permits internal GET health probes.
- Explicit CSP, Bluetooth Permissions-Policy, HSTS, nosniff, frame denial,
  no-referrer and no-store headers are applied before request processing.
- Per-IP API and login limits run before JSON parsing; normalized username/IP
  login limits prevent whitespace/case bypass. All throttles return Problem
  Details and retry headers. IPv6 subnet grouping uses the existing library.
- Production startup rejects invalid origins, HTTP origins, placeholder secrets,
  repetitive secrets and invalid/unrestricted proxy settings. Errors name only
  invalid configuration fields.
- Production host-only cookie flags and logout expiry are verified. Local HTTP
  development retains its existing cookie behavior without forced TLS upgrades.
- HTTP log serializers omit bodies, query strings, headers and raw exception
  contents; existing secret-field redaction remains enabled.
- Operations documentation specifies real-proxy header overwrites, network
  isolation, frontend response policies, secret generation/rotation and the
  per-process scope of rate limits.

## Verification

- Complete HTTP contract suite: 142 tests passed across 11 files with disposable
  PostgreSQL and OpenAPI request/response validation.
- Final API unit and foundation contract run: 121 tests passed across 14 files.
  Includes 26 security/configuration/logger tests covering trusted/untrusted
  proxies, forged forwarding headers, IP limits, rotating login usernames,
  normalized usernames, cookies, development HTTP, configuration errors and
  credential-bearing actual HTTP logs.
- Workspace typecheck and API production build pass.
- Lint, changed-file formatting and Git whitespace checks pass.

## Limits

The API does not serve the frontend HTML. Its production TLS/static host must
apply the documented CSP and Permissions-Policy to HTML responses. No live
deployment or physical Bluetooth device was used. The memory rate-limit store
is per process and resets on restart; multiple replicas need aggregate edge or
shared-store enforcement. Secret validation detects mistakes, not randomness.
No database migrations, dependencies or business authorization rules changed.

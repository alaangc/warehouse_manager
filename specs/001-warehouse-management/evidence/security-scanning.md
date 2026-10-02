# T143 dependency and browser security gates

Implemented and locally verified 2026-09-17. `.github/workflows/security.yml`
runs on main pushes, pull requests, manual dispatch and weekly schedule, with
read-only repository permissions and the existing SHA-pinned setup actions.

## Gates

- `pnpm audit --audit-level=low` fails on any reported vulnerability, including
  development dependencies. Registry/network errors are failures, not clean results.
- `pnpm security:licenses` inventories installed pnpm package manifests and rejects
  missing/unrecognized license metadata and paid MUI X/pro/premium/license packages.
  The checked-in accepted SPDX expressions reflect the current dependency inventory.
  `png-js@2.0.0` lacks a manifest license; its bundled MIT LICENSE is accepted only
  with the exact normalized SHA-256 recorded in the script. License-file changes or
  new expressions require review. Existing MPL-2.0 metadata belongs to lightningcss
  and its native build dependency. This inventory is not a distribution-notice audit.
- `pnpm security:browser` scans every generated asset, including any source maps,
  and the lockfile. Missing/empty bundles and bundle symlinks fail closed. Detection
  includes paid MUI names, private-key headers, credential-bearing PostgreSQL URLs,
  common credential-token formats, and raw/JSON-escaped/URI/base64 values from
  secret-like environment variables of at least eight characters. Output reports
  filenames and rule names, never the matched secret value.
- The CI browser build receives non-secret database/session canaries before Vite
  runs, then scans the actual production assets. Security script typechecking is
  included in the root `typecheck`; scripts run using the pinned Node 24's native
  TypeScript support and need no additional runtime dependency.

## Results and remediation

The initial registry audit found two moderate advisories in qs@6.15.3:
[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) and
[GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).
The root override pins qs@6.16.0 for Express/body-parser/Superagent. The lockfile
diff is confined to that override, version, integrity and dependent references.
The final live npm audit returned zero vulnerabilities at every severity.

The installed-license scan passed (626 resolved package directories after the
targeted install; the local virtual store includes a superseded qs directory).
Five security tests passed: paid/community package discrimination, secret
encodings/redacted diagnostics, missing bundles, recursive assets/source maps and
empty bundles, and unknown/legacy license metadata. The canary production web
build and its bundle scan passed. Vite retains its nonblocking large-chunk warning.
Lint, formatting and workspace/script types passed.
After the qs update, the complete API contract project passed: 12 files,
144 tests, no skipped tests, using isolated PostgreSQL databases and
`--no-file-parallelism` (89.93 seconds).

The first `pnpm licenses list` could not read a missing local store index; the
implemented scan uses installed manifests instead. The first registry audit was
network-restricted and was rerun with network access. Neither failed attempt was
treated as a passing scan. The Node test command avoids the local tsx user-info
sandbox error observed during the initial attempt.

## Reproduction and limits

Run a frozen install, then `pnpm security:test`, `pnpm security:licenses`,
`pnpm audit --audit-level=low`, `pnpm typecheck` and `pnpm lint`. Build the contracts
and web app with the same non-secret canaries in the workflow, then run
`pnpm security:browser`. CI scans a fresh Linux install, so its platform-native
dependency inventory differs from this local Windows inventory.

The workflow has been added; a hosted Actions result is not claimed here. Scanning
is a preventive check for defined patterns and available environment values, not
a proof against arbitrary unknown or deliberately obfuscated secrets. A clean
registry audit is a point-in-time result. T144 clean-environment verification,
T133 physical hardware and T141 human acceptance remain separate release gates.

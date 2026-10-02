# T128 Transport Validation

Completed on 2026-09-13. The adapter now accepts committed document metadata and
prepared bytes through `print(document, { mode, bytes, confirmed? })`.

## Boundary

The transport validates the document/source pair and READY state. Tickets require
COMPLETED sources, route loads require CONFIRMED sources, and cash closes require
CLOSED sources. REPORT printing is rejected. The caller supplies the bytes produced
by the T129 formatter and must obtain API acceptance before invoking this transport
(T132). Local metadata validation does not replace server authorization.

Transport tests now use deterministic prepared bytes instead of importing the
not-yet-implemented formatter. Their byte-order, chunk-size, delay and disconnect
assertions remain intact. The eleven separate T129 formatter tests are unchanged
and remain pending; T128 does not claim formatted receipt or physical printer
acceptance.

Connection retains approved service/characteristic UUID filtering, secure-context,
permissions-policy and user-activation checks. Print and setup test share the same
serial write loop with configured chunk sizes, write mode and inter-chunk delay.
The adapter copies caller-owned bytes before asynchronous work and prevents
overlapping test/print/connect operations. PRINTING is exposed in the connection
snapshot and translated in the printer settings screen.

Failures before writing return FAILED. Any ambiguous first, partial or final write
returns UNKNOWN, disconnects, and never automatically retries. An UNKNOWN document
requires an explicitly confirmed REPRINT even after reconnecting the same adapter.
This memory is local to the adapter instance; durable attempt history and recovery
across page reloads belong to T132 and the existing API ledger.

## Evidence

The original 13 transport cases first failed because `print` was absent. After
implementation, 20 transport cases and 33 connection/settings regression cases
passed (53 total):

```powershell
pnpm exec vitest run --config vitest.workspace.ts --project web apps/web/tests/printers/printer-adapter.test.ts -t 'document transport'
pnpm exec vitest run --config vitest.workspace.ts --project web apps/web/tests/printers/web-bluetooth-adapter.test.ts apps/web/tests/printers/printer-preference.test.tsx apps/web/tests/printers/printer-profile-ui.test.tsx
pnpm build
```

Focused ESLint and web typecheck passed. The complete workspace build passed with
the existing web bundle size warning. Formatting and diff checks passed.

Review confirmed no source mutation, no automatic retry, immutable copied payloads,
shared ordered GATT writes, and rejection before bytes for invalid document states.
Tests use simulated GATT devices; physical printer and full print-dialog acceptance
remain assigned to their later tasks.

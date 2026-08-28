# HTTP Contract Notes

The normative planning contract is [openapi.yaml](./openapi.yaml). It targets OpenAPI
3.1.2 and `/api/v1`.

During implementation, strict Zod transport schemas become the executable source for
request, response, and configuration validation. Contract generation MUST reproduce
the semantics in this design artifact. The generated OpenAPI document is checked into
the contract package, linted in strict mode, diffed in review, used to generate frontend
types, and exercised with request/response validation in API integration tests.

## Contract Rules

- Except for login and health checks, operations require the opaque `__Host-wm_session`
  cookie. Authorization is enforced per operation and resource by the API.
- List and detail history operations are scoped by the authenticated principal in the
  API and repository query. Administrators may access system-wide history. Drivers may
  access only their own completed sales and every state/history record for routes
  assigned to them; Driver-controlled filters never broaden authorization, and direct
  access to another Driver's sale or route returns 403.
- Authenticated unsafe requests require `X-CSRF-Token` and same-origin request checks.
- Critical business mutations require `Idempotency-Key`. Replaying the same validated
  request returns the original result; reusing a key for different content returns 409.
- Money and quantities are JSON strings matching the decimal schemas. Authoritative
  calculations never use JSON/JavaScript binary floating point.
- Validation failures use 422, authentication failures 401, authorization failures 403,
  missing resources 404, state/version/idempotency conflicts 409, throttling 429, and
  unexpected failures 500. All use RFC 9457 `application/problem+json`.
- Mutable catalog resources carry `version`; updates submit `expectedVersion` and fail
  with 409 rather than silently overwriting a concurrent change.
- List endpoints use opaque keyset cursors with stable `(createdAt DESC, id DESC)`
  ordering, default limit 25, and maximum limit 100. A cursor is bound to the
  authenticated principal, role, and normalized filters and cannot be reused to change
  scope.
- Routes expose explicit transition commands rather than a generic state update.
- Canonical PDF generation and output-attempt recording operate only on committed source
  records. Retrying output never retries the underlying sale, load, reconciliation, or
  cash close.
- `TICKET` is the only customer-facing sale-document type and always derives from a
  committed `SALE`; there is no second customer-facing document type. Document request
  schemas constrain every document type to its valid source type.

## Reporting Periods and Cash-Close Corrections

Report and cash-close requests use `periodKind` (`DAY`, `WEEK`, or `MONTH`) plus a local
`anchorDate`; clients do not author authoritative UTC boundaries. The API resolves the
period in the configured IANA business timezone and returns the captured timezone and
resolved `[periodStart, periodEnd)` instants. Days run local midnight to local midnight,
weeks Monday to Monday, and months first-of-month to first-of-next-month. Each local
boundary is resolved independently across timezone-offset changes.

Only one CashClose is current for an exact timezone/start/end tuple. Replaying the same
request under the same Idempotency-Key returns its original status/body. A separate
create for an occupied period returns 409 `CASH_CLOSE_PERIOD_ALREADY_CURRENT`; reusing
an idempotency key with changed content returns 409 `IDEMPOTENCY_KEY_REUSED`.
`POST /cash-closes/{cashCloseId}/corrections` requires a reason and creates an immutable
same-period successor. It atomically moves the current-period pointer without changing
the predecessor snapshot. Targeting a non-current close or losing a concurrent
correction returns 409 `CASH_CLOSE_NOT_CURRENT`.

## Compatibility Policy

- Backward-compatible optional fields/endpoints may be added within `/api/v1` after
  frontend compatibility review.
- Removing/renaming fields, narrowing accepted values, changing decimal semantics, or
  changing state transitions requires a coordinated migration or `/api/v2`.
- CI rejects uncommitted generated contract/type changes and breaking contract diffs
  without an approved migration note.

## Browser Printing Boundary

The API stores approved PrinterProfile metadata and records output attempts. Physical
device selection, connection, BLE writes, and disconnect handling occur through the
frontend PrinterAdapter because Web Bluetooth permission/device handles belong to the
browser profile. The adapter reports `SUCCEEDED`, `FAILED`, or `UNKNOWN`; `UNKNOWN` is
used after ambiguous partial output and requires an explicit user reprint.

| Document type | Generate PDF | Save/download | Share | Thermal print/reprint |
|---|---:|---:|---:|---:|
| `TICKET` | Yes | Yes | Yes | Yes |
| `ROUTE_LOAD` | Yes | Yes | Yes | Yes |
| `CASH_CLOSE` | Yes | Yes | Yes | Yes |
| `REPORT` | Yes | Yes | Yes | No |

| Document | Required source state | Administrator | Driver |
|---|---|---|---|
| `TICKET` | Committed Sale | Any | Own Sale only |
| `ROUTE_LOAD` | `CONFIRMED` RouteLoad | Any | Assigned Route only |
| `CASH_CLOSE` | Committed CashClose | Any | Denied |
| `REPORT` | Immutable ReportSnapshot | Any | Denied |

The API validates the referenced DocumentOutput type before accepting PRINT or REPRINT;
frontend visibility is not enforcement. A report print/reprint request returns 422 and
creates no accepted OutputAttempt, while leaving the ReportSnapshot, DocumentOutput,
and every source business transaction unchanged. TEST_PRINT validates a PrinterProfile
without referencing a business document.

Document authorization derives from the immutable Sale or Route source, not from
`DocumentOutput.createdBy`. It applies uniformly to generation/reuse, metadata, content,
save/share, print/reprint, and OutputAttempt recording. An authorized Driver may use an
output originally generated by an Administrator; knowing an unauthorized document ID
never grants access. Driver access to another Driver's Ticket, an unassigned RouteLoad,
CASH_CLOSE, or REPORT returns 403 without exposing or creating anything. An authorized
DRAFT RouteLoad request returns 409 `ROUTE_LOAD_NOT_CONFIRMED`; drafts have no output
document. Authentication/source authorization runs before capability validation, so a
Driver's REPORT print attempt returns 403 while an Administrator's returns 422.

`GET /documents`, `GET /output-attempts`, and
`GET /output-attempts/{outputAttemptId}` expose browsable history under the same source
authorization. Administrators see all records, including TEST_PRINT attempts. Drivers
see documents and attempts only when the immutable source is their own Sale or a
CONFIRMED RouteLoad on an assigned Route, even when an Administrator created the output
or recorded the attempt. TEST_PRINT has no source and is therefore excluded from Driver
history. Type/state/source/document/mode/time filters intersect mandatory scope; direct
IDs, filters, and cursors never broaden it or expose forbidden metadata.

## Acceptance-Test Boundaries

API response latency alone does not satisfy SC-006. Browser acceptance timing ends only
after loading has ended; matching rows or an explicit no-results state is visible;
identifying fields and relevant values are rendered; and every result action available
to that user is enabled. Contract tests verify that search responses contain the fields
needed to render this state, while the two-second measurement remains browser-level.

The usability fixture does not narrow ordinary API cardinality. Its Driver sale has
exactly ten lines, and its Administrator route has exactly one documented difference.
One scored attempt is uninterrupted: corrections before final submission remain valid,
but a rejected final submission, restart, or assistance fails the attempt.

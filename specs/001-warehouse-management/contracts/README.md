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
- List endpoints use cursor pagination. Stable ordering and cursor semantics are defined
  per endpoint during implementation and included in generated descriptions/tests.
- Routes expose explicit transition commands rather than a generic state update.
- Canonical PDF generation and output-attempt recording operate only on committed source
  records. Retrying output never retries the underlying sale, load, reconciliation, or
  cash close.
- `TICKET` is the only customer-facing sale-document type and always derives from a
  committed `SALE`; there is no second customer-facing document type. Document request
  schemas constrain every document type to its valid source type.

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

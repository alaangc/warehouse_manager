# T142 operational failure logs

Implemented 2026-09-17. Structured warning events use `event=operation_failure`,
an allowlisted `operation` and stable `code`. HTTP events inherit the existing
request logger and request ID through AsyncLocalStorage, including asynchronous
transaction work. Direct service/maintenance calls use a background logger.
The configured HTTP log level must include `warn` to collect these events.

Signals cover authentication rejection/throttling, invalid or forbidden history
cursors, duplicate/currentness/total-mismatch cash-close failures, transaction
retry/terminal failure/exhaustion, document generation/storage/content failure,
and failed or uncertain PRINT/REPRINT/TEST_PRINT submissions.

Transaction signals contain attempt number and only the two known retry SQLSTATEs.
Raw error messages, SQL, request bodies, credentials, cursor contents, and
client-supplied printer error codes are excluded. Logging exceptions do not replace
business outcomes. No response contracts, stored financial data, or migrations changed.

Document generation events are emitted after the FAILED document and output attempt
commit. Printer events are emitted after the output-attempt transaction resolves.
A failed output still leaves its source sale/inventory/cash-close unchanged.

## Verification

The initial test run failed on the absent operations module. After implementation,
the initial nine HTTP/retry checks passed. The first database attempt was unable
to connect because the local test cluster was stopped; no database assertion ran.
After starting the dedicated local PostgreSQL 18 cluster, four suites passed:
failure-signals, document-service, cash-close-currentness, and transaction-idempotency
(39 tests). Added production-route authentication/cursor checks and concurrent
request-correlation/success checks are included in the final focused run.
Final focused result: failure-signals (15 tests) plus foundation HTTP contracts
(4 tests), 19 passed. Lint, workspace types and changed-source formatting passed.

The final failure-signals suite uses real PostgreSQL for cash-close duplicate,
stale and concurrent corrections (exactly one surviving successor), committed
printer failures, renderer failure with unchanged business snapshots, and injected
SQLSTATE 40001 after a write (zero persisted rows after retry exhaustion).
The smaller Express harness injects controlled failures to verify both retryable
SQLSTATEs, correlation, redaction and ordinary terminal errors deterministically.
Authentication and history-cursor checks also traverse production HTTP routes.

Reproduction with the dedicated local test server, or omit the variable for Docker:

```powershell
$env:TEST_POSTGRES_ADMIN_URL='postgresql://warehouse_test@127.0.0.1:5432/postgres'
.tools/bin/pnpm.cmd exec vitest run --config vitest.workspace.ts apps/api/tests/integration/observability/failure-signals.test.ts apps/api/tests/integration/documents/document-service.test.ts apps/api/tests/integration/reports/cash-close-currentness.test.ts apps/api/tests/integration/shared/transaction-idempotency.test.ts --no-file-parallelism
```

## Interpretation and limits

These are structured logs, not a new metrics endpoint or monitoring deployment.
Aggregate by `operation` and `code`; use request IDs to correlate related events.
Count TRANSACTION_RETRY separately from TRANSACTION_EXHAUSTED/TRANSACTION_FAILED.
A terminal transaction and its HTTP rejection may both emit events. Replayed
failed printer submissions emit another observation without another persisted
attempt. Log counts therefore represent observations, not unique failed sales or
unique print jobs. Printer results are browser-reported and do not prove physical
hardware output. T133 and the human portion of T141 remain pending.

import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestHandler } from 'express';
import pino, { type Logger } from 'pino';

const context = new AsyncLocalStorage<Pick<Logger, 'warn'>>();
const backgroundLogger = pino({ name: 'operations' });

export const operationContext: RequestHandler = (request, _response, next) => {
  context.run(request.log ?? backgroundLogger, next);
};

const failureOperations = {
  INVALID_CREDENTIALS: 'authentication',
  AUTHENTICATION_REQUIRED: 'authentication',
  RATE_LIMIT_EXCEEDED: 'authentication',
  CASH_CLOSE_PERIOD_ALREADY_CURRENT: 'cash_close',
  CASH_CLOSE_NOT_CURRENT: 'cash_close',
  CASH_CLOSE_TOTAL_MISMATCH: 'cash_close',
  INVALID_HISTORY_CURSOR: 'history_cursor',
  HISTORY_CURSOR_FORBIDDEN: 'history_cursor',
  DOCUMENT_GENERATION_FAILED: 'document',
  DOCUMENT_STORAGE_FAILED: 'document',
  DOCUMENT_CONTENT_UNAVAILABLE: 'document',
  TRANSACTION_RETRY: 'transaction',
  TRANSACTION_EXHAUSTED: 'transaction',
  TRANSACTION_FAILED: 'transaction',
  PRINTER_ATTEMPT_FAILED: 'printer',
  PRINTER_ATTEMPT_UNKNOWN: 'printer',
} as const;

/** Logs are event counts, not unique business failures. Never accept arbitrary payloads. */
export function recordOperationFailure(
  code: string,
  details: { status?: number; attempt?: number; sqlState?: '40001' | '40P01' } = {},
): void {
  if (!Object.hasOwn(failureOperations, code)) return;
  const operation = failureOperations[code as keyof typeof failureOperations];
  try {
    (context.getStore() ?? backgroundLogger).warn(
      {
        event: 'operation_failure',
        operation,
        code,
        ...(details.status === undefined ? {} : { status: details.status }),
        ...(details.attempt === undefined ? {} : { attempt: details.attempt }),
        ...(details.sqlState === undefined ? {} : { sqlState: details.sqlState }),
      },
      'Operational failure',
    );
  } catch {
    // A broken log sink must not change a transaction, response, or retry outcome.
  }
}

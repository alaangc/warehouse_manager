import type { Kysely, Transaction } from 'kysely';
import { recordOperationFailure } from '../observability/operations.js';

type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  onRetry?: (error: unknown, attempt: number) => void;
};

export function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return error.code === '40001' || error.code === '40P01';
}

export async function retryTransactionOperation<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 20;
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const retryable = isRetryableTransactionError(error);
      recordOperationFailure(
        !retryable
          ? 'TRANSACTION_FAILED'
          : attempt === maxAttempts
            ? 'TRANSACTION_EXHAUSTED'
            : 'TRANSACTION_RETRY',
        {
          attempt,
          ...(retryable ? { sqlState: (error as { code: '40001' | '40P01' }).code } : {}),
        },
      );
      if (!retryable || attempt === maxAttempts) throw error;
      options.onRetry?.(error, attempt);
      const jitter = Math.floor(random() * baseDelayMs);
      await sleep(baseDelayMs * 2 ** (attempt - 1) + jitter);
    }
  }
  throw new Error('Unreachable transaction retry state');
}

export async function runSerializable<DB extends object, T>(
  database: Kysely<DB>,
  operation: (transaction: Transaction<DB>, attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  return retryTransactionOperation(
    (attempt) =>
      database
        .transaction()
        .setIsolationLevel('serializable')
        .execute((transaction) => operation(transaction, attempt)),
    options,
  );
}

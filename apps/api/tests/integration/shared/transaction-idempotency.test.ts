import { describe, expect, it, vi } from 'vitest';
import { canonicalRequestHash } from '../../../src/shared/idempotency/idempotency-service.js';
import {
  isRetryableTransactionError,
  retryTransactionOperation,
} from '../../../src/db/serializable-transaction.js';

describe('transaction and idempotency foundation', () => {
  it('retries serialization failures with a bounded attempt count', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('serialization'), { code: '40001' }))
      .mockResolvedValue('committed');
    await expect(
      retryTransactionOperation(operation, { sleep: async () => undefined, random: () => 0 }),
    ).resolves.toBe('committed');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('recognizes only serialization and deadlock failures', () => {
    expect(isRetryableTransactionError({ code: '40001' })).toBe(true);
    expect(isRetryableTransactionError({ code: '40P01' })).toBe(true);
    expect(isRetryableTransactionError({ code: '23505' })).toBe(false);
  });

  it('exhausts retries observably', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('deadlock'), { code: '40P01' }));
    await expect(
      retryTransactionOperation(operation, {
        maxAttempts: 3,
        sleep: async () => undefined,
        random: () => 0,
      }),
    ).rejects.toThrow('deadlock');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('hashes canonical content independently of object key order', () => {
    expect(canonicalRequestHash({ b: 2, a: 1 })).toBe(canonicalRequestHash({ a: 1, b: 2 }));
    expect(canonicalRequestHash({ a: 2 })).not.toBe(canonicalRequestHash({ a: 1 }));
  });
});

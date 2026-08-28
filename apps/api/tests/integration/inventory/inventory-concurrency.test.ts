import { describe, expect, it } from 'vitest';
import { retryTransactionOperation } from '../../../src/db/serializable-transaction.js';

describe('inventory concurrency policy', () => {
  it('retries a serialization loser without duplicating the successful result', async () => {
    let attempts = 0;
    const result = await retryTransactionOperation(
      async () => {
        attempts += 1;
        if (attempts === 1) throw Object.assign(new Error('serialization'), { code: '40001' });
        return 'one-commit';
      },
      { sleep: async () => undefined, random: () => 0 },
    );
    expect(result).toBe('one-commit');
    expect(attempts).toBe(2);
  });
});

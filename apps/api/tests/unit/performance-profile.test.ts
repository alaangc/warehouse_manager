import { describe, expect, it } from 'vitest';
import {
  performanceId,
  searchAction,
  summarizeSearch,
  type SearchMeasurement,
} from '../../../../tests/e2e/support/performance-profile.js';

describe('SC-006 measurement policy', () => {
  it('uses stable valid IDs and balances all six cells over 450 searches', () => {
    expect(performanceId('product', 1)).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-8[\da-f]{3}-[\da-f]{12}$/,
    );
    expect(performanceId('product', 1)).toBe(performanceId('product', 1));
    const counts = new Map<string, number>();
    for (let user = 0; user < 25; user++)
      for (let round = 0; round < 18; round++) {
        const action = searchAction(user, round);
        const key = `${action.kind}:${action.matches}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        expect(action.number).toBeGreaterThanOrEqual(1);
        expect(action.number).toBeLessThanOrEqual(10_000);
      }
    expect([...counts.values()]).toEqual([75, 75, 75, 75, 75, 75]);
  });
  it('counts incomplete and slow samples as failures without dropping them', () => {
    const sample: SearchMeasurement = {
      user: 0,
      round: 0,
      kind: 'products',
      matches: true,
      query: 'x',
      elapsedMs: 100,
      complete: true,
    };
    expect(
      summarizeSearch([sample, { ...sample, elapsedMs: 2_001 }, { ...sample, complete: false }]),
    ).toMatchObject({
      count: 3,
      completeCount: 2,
      passCount: 1,
      requiredPassCount: 3,
      p95Ms: 2_001,
    });
  });
});

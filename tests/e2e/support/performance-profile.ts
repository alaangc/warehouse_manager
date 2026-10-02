import { createHash } from 'node:crypto';

export const PERFORMANCE_SEED = 'wm-perf-v1';
export const PERFORMANCE_USERS = 25;
export const SEARCH_ROUNDS = 18;
export const SEARCH_KINDS = ['products', 'customers', 'inventory'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export function performanceId(kind: string, n: number): string {
  const hash = createHash('md5').update(`${PERFORMANCE_SEED}:${kind}:${n}`).digest('hex').split('');
  hash[12] = '4';
  hash[16] = '8';
  const value = hash.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
export function searchAction(user: number, round: number) {
  const cell = (round + user) % 6;
  const kind = SEARCH_KINDS[Math.floor(cell / 2)]!;
  const matches = cell % 2 === 0;
  // Traverse the full catalog, including records beyond the first response page.
  const number = 1 + ((user * 397 + round * 211) % 10_000);
  const suffix = String(number).padStart(5, '0');
  return {
    kind,
    matches,
    number,
    suffix,
    query: matches
      ? kind === 'inventory'
        ? `Perf product ${suffix}`
        : suffix
      : `absent-${user}-${round}`,
  };
}
export interface SearchMeasurement {
  user: number;
  round: number;
  kind: SearchKind;
  matches: boolean;
  query: string;
  elapsedMs: number;
  complete: boolean;
  error?: string;
}
export function summarizeSearch(samples: SearchMeasurement[]) {
  const values = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
  const percentile = (p: number) => values[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null;
  const passCount = samples.filter((sample) => sample.complete && sample.elapsedMs <= 2_000).length;
  return {
    count: samples.length,
    completeCount: samples.filter((sample) => sample.complete).length,
    passCount,
    requiredPassCount: Math.ceil(samples.length * 0.95),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: values.at(-1) ?? null,
  };
}

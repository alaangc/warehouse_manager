import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// Conservatively require review for every non-editorial change, including additions.
// This avoids claiming a complete JSON Schema subtyping/breaking-change proof.
const editorial = new Set(['description', 'summary', 'examples', 'example', 'externalDocs']);
const namedMaps = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'schemas',
  'paths',
  'responses',
  'content',
  'headers',
  'securitySchemes',
  'mapping',
]);
function canonical(value: unknown, preserveKeys = false, literal = false): unknown {
  if (Array.isArray(value)) return value.map((item) => canonical(item, literal, literal));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => literal || preserveKeys || !editorial.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [
          key,
          canonical(
            child,
            namedMaps.has(key),
            literal || ['const', 'enum', 'default'].includes(key),
          ),
        ]),
    );
  return value;
}
export function contractHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export function checkCompatibility(
  base: unknown,
  head: unknown,
  review?: Record<string, unknown>,
): void {
  const baseHash = contractHash(base);
  const headHash = contractHash(head);
  if (baseHash === headHash) return;
  if (!review)
    throw new Error(
      `Contract compatibility review required. baseSha256=${baseHash} headSha256=${headHash}`,
    );
  if (review['baseSha256'] !== baseHash || review['headSha256'] !== headHash)
    throw new Error(
      `Compatibility review hashes do not match. baseSha256=${baseHash} headSha256=${headHash}`,
    );
  if (!['compatible', 'breaking'].includes(String(review['classification'])))
    throw new Error('Review classification must be compatible or breaking');
  for (const field of ['rationale', 'migration', 'validation', 'owner'])
    if (typeof review[field] !== 'string' || review[field].trim().length < 5)
      throw new Error(`Compatibility review requires ${field}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseRef = process.env['CONTRACT_BASE_REF'] ?? process.argv[2];
  if (!baseRef || !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(baseRef))
    throw new Error('Supply a valid CONTRACT_BASE_REF (CI uses the PR base or push before SHA)');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const path = 'specs/001-warehouse-management/contracts/openapi.yaml';
  const base = parse(
    execFileSync('git', ['show', `${baseRef}:${path}`], { cwd: root, encoding: 'utf8' }),
  );
  const head = parse(await readFile(resolve(root, path), 'utf8'));
  let review: Record<string, unknown> | undefined;
  if (contractHash(base) !== contractHash(head)) {
    const reviewPath = resolve(
      root,
      'specs/001-warehouse-management/contracts/compatibility',
      `${contractHash(head)}.json`,
    );
    try {
      review = JSON.parse(await readFile(reviewPath, 'utf8')) as Record<string, unknown>;
    } catch {
      /* checkCompatibility emits the required hashes when a review is missing. */
    }
  }
  checkCompatibility(base, head, review);
  process.stdout.write(
    'Contract compatibility gate passed; wire changes require human review of the hash-bound migration note.\n',
  );
}

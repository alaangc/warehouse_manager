import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { browserViolations, scanBrowserBundle } from './check-browser-bundle-secrets.ts';
import { acceptedLicense, declaredLicense } from './check-dependency-licenses.ts';

test('paid MUI tiers and licensing packages are rejected while Core and Community remain allowed', () => {
  for (const name of [
    '@mui/x-data-grid-pro',
    '@mui/x-data-grid-premium',
    '@mui/x-date-pickers-pro',
    '@mui/x-license',
    '@mui/x-license-pro',
  ])
    assert.deepEqual(browserViolations(`${name}@1.0.0:`), ['paid-mui-package']);
  for (const name of ['@mui/material', '@mui/x-data-grid', '@mui/x-date-pickers'])
    assert.deepEqual(browserViolations(`${name}@1.0.0:`), []);
});
test('secret detection covers raw and encoded canaries without echoing them', () => {
  const secret = 'test-secret-:/with-encoding';
  for (const value of [
    secret,
    encodeURIComponent(secret),
    Buffer.from(secret).toString('base64'),
  ]) {
    const result = browserViolations(`var value = '${value}'`, [secret]);
    assert.deepEqual(result, ['server-secret-value']);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  assert.deepEqual(browserViolations('postgresql://user:private@localhost/db'), [
    'database-credentials',
  ]);
  assert.deepEqual(browserViolations('-----BEGIN PRIVATE KEY-----'), ['private-key']);
});
test('missing bundles fail closed', async () => {
  await assert.rejects(scanBrowserBundle('var/nonexistent-security-build'));
});
test('all nested assets including source maps are scanned; empty bundles fail closed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'warehouse-security-'));
  try {
    await assert.rejects(scanBrowserBundle(root), /empty/);
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'index.html'), '<html>Warehouse</html>');
    await writeFile(path.join(root, 'assets', 'main.js'), 'console.log("safe")');
    assert.deepEqual(await scanBrowserBundle(root), []);
    await writeFile(
      path.join(root, 'assets', 'main.js.map'),
      '{"sourcesContent":["private-canary-value"]}',
    );
    const result = await scanBrowserBundle(root, ['private-canary-value']);
    assert.equal(result.length, 1);
    assert.ok(result[0]!.endsWith('main.js.map: server-secret-value'));
    assert.ok(!result[0]!.includes('private-canary-value'));
  } finally {
    assert.ok(
      path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep + 'warehouse-security-'),
    );
    await rm(root, { recursive: true, force: true });
  }
});
test('unknown and missing licenses fail closed; legacy metadata is supported', () => {
  assert.equal(acceptedLicense(undefined), false);
  assert.equal(acceptedLicense('UNLICENSED'), false);
  assert.equal(acceptedLicense('unknown'), false);
  assert.equal(acceptedLicense('MIT'), true);
  assert.equal(declaredLicense({ licenses: [{ type: 'MIT' }] }), 'MIT');
});

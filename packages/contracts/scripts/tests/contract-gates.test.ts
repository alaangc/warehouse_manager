import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
import { createContractValidator } from '../validate-runtime-contract.js';
import { checkCompatibility, contractHash } from '../check-compatibility.js';
import { generateArtifacts, checkArtifacts } from '../contract-artifacts.js';

const source = await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8');
const document = parse(source);

test('generated types and version stamp are checked without overwriting stale files', async () => {
  const artifacts = await generateArtifacts(source);
  assert.match(artifacts['src/generated/api-types.ts']!, /interface paths/);
  assert.match(artifacts['src/generated/api-types.ts']!, /getDocumentPrintData/);
  assert.throws(
    () => checkArtifacts(artifacts, { ...artifacts, 'src/generated/api-types.ts': 'stale' }),
    /api-types/,
  );
  assert.throws(
    () => checkArtifacts(artifacts, { ...artifacts, 'src/generated/contract-stamp.ts': 'stale' }),
    /contract-stamp/,
  );
});

test('validates requests, decimal strings, required headers, parameters, and unknown operations', () => {
  const validator = createContractValidator(document);
  validator.request('POST', '/auth/login', {
    body: { username: 'admin', password: 'password123' },
    headers: { 'content-type': 'application/json' },
  });
  assert.throws(
    () =>
      validator.request('POST', '/auth/login', {
        body: { username: 'admin', password: 'short' },
        headers: { 'content-type': 'application/json' },
      }),
    /request/,
  );
  assert.throws(() => validator.request('POST', '/auth/logout', {}), /X-CSRF-Token/i);
  assert.throws(() => validator.request('GET', '/products?limit=101', {}), /limit/);
  assert.throws(() => validator.request('GET', '/documents/invalid', {}), /documentId/);
  assert.throws(() => validator.request('GET', '/missing', {}), /Undocumented/);
  validator.schema('Money', '12.00');
  assert.throws(() => validator.schema('Money', 12), /Money/);
});

test('validates response status, media type, body shape, empty responses and binary PDF', () => {
  const validator = createContractValidator(document);
  validator.response('GET', '/health', {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: { status: 'ok' },
  });
  assert.throws(
    () =>
      validator.response('GET', '/health', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { status: 'bad' },
      }),
    /response/,
  );
  assert.throws(
    () => validator.response('GET', '/health', { status: 201, headers: {}, body: {} }),
    /Undocumented/,
  );
  assert.throws(
    () =>
      validator.response('GET', '/health', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: { status: 'ok' },
      }),
    /media type/,
  );
  validator.response('POST', '/auth/logout', { status: 204, headers: {}, body: '' });
  assert.throws(
    () =>
      validator.response('POST', '/auth/logout', {
        status: 204,
        headers: {},
        body: { unexpected: true },
      }),
    /empty/,
  );
  validator.response('GET', '/documents/00000000-0000-4000-8000-000000000001/content', {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
    body: Buffer.from('%PDF-1.7'),
  });
});

test('compatibility gate ignores prose and requires a hash-bound migration review for wire changes', () => {
  const base = {
    paths: {
      '/health': {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: { type: 'string' } } },
            },
          },
        },
      },
    },
  };
  const prose = structuredClone(base);
  prose.paths['/health'].get.responses['200'].description = 'updated prose';
  assert.doesNotThrow(() => checkCompatibility(base, prose));
  const changed = structuredClone(base);
  changed.paths['/health'].get.responses['200'].content['application/json'].schema.type = 'number';
  assert.throws(() => checkCompatibility(base, changed), /compatibility review/i);
  const review = {
    baseSha256: contractHash(base),
    headSha256: contractHash(changed),
    classification: 'breaking',
    rationale: 'Change the response representation.',
    migration: 'Introduce /api/v2, migrate clients, retain /api/v1 through 2026-12-31.',
    validation: 'Contract and browser suites verify both clients.',
    owner: '@alaangc',
  };
  assert.doesNotThrow(() => checkCompatibility(base, changed, review));
  assert.throws(
    () => checkCompatibility(base, changed, { ...review, headSha256: 'stale' }),
    /hash/i,
  );
  assert.throws(
    () => checkCompatibility(base, changed, { ...review, migration: '' }),
    /migration/i,
  );
  assert.notEqual(
    contractHash({ properties: { description: { type: 'string' } } }),
    contractHash({ properties: {} }),
  );
  assert.notEqual(
    contractHash({ const: { description: 'before' } }),
    contractHash({ const: { description: 'after' } }),
  );
});

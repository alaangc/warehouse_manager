import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { documentHarness, problem } from '../../support/document-harness.js';

describe('T127 HTTP retry and response boundaries', () => {
  let h: Awaited<ReturnType<typeof documentHarness>>;
  beforeAll(async () => {
    h = await documentHarness();
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  });

  it('replays concurrent output requests once and rejects different content for the same key', async () => {
    const doc = await h.ready(h.ticket);
    const key = crypto.randomUUID();
    const body = { documentId: doc.id, mode: 'DOWNLOAD', state: 'SUCCEEDED' };
    const send = () =>
      h.send(h.driver, 'post', '/output-attempts', body).set('Idempotency-Key', key);
    const responses = await Promise.all([send(), send()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[1]!.body).toEqual(responses[0]!.body);
    problem(
      await h
        .send(h.driver, 'post', '/output-attempts', { ...body, mode: 'SHARE' })
        .set('Idempotency-Key', key),
      409,
    );
    const rows = await h.database
      .selectFrom('output_attempt')
      .select('id')
      .where('document_output_id', '=', doc.id)
      .where('mode', '=', 'DOWNLOAD')
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('binds document request keys to content while returning the latest canonical state', async () => {
    const key = crypto.randomUUID();
    const send = () => h.send(h.admin, 'post', '/documents', h.ticket).set('Idempotency-Key', key);
    const first = await send();
    const second = await send();
    expect(first.status).toBe(202);
    expect(second.body).toEqual(first.body);
    problem(await h.send(h.admin, 'post', '/documents', h.load).set('Idempotency-Key', key), 409);
  });

  it('checks authorization before a missing printer and persists no rejected request', async () => {
    const doc = await h.ready(h.reportSource);
    const body = { documentId: doc.id, mode: 'PRINT', state: 'STARTED' };
    const before = await h.database.selectFrom('idempotency_request').select('id').execute();
    problem(await h.command(h.driver, '/output-attempts', body), 403);
    problem(await h.command(h.admin, '/output-attempts', body), 422);
    expect(await h.database.selectFrom('idempotency_request').select('id').execute()).toEqual(
      before,
    );
  });

  it('requires idempotency keys for document and attempt mutations', async () => {
    const doc = await h.ready(h.ticket);
    problem(await h.send(h.admin, 'post', '/documents', h.ticket), 422);
    problem(
      await h
        .send(h.admin, 'post', '/output-attempts', {
          documentId: doc.id,
          mode: 'SHARE',
          state: 'SUCCEEDED',
        })
        .unset('Idempotency-Key'),
      422,
    );
  });

  it('streams private PDF bytes without exposing storage keys in metadata', async () => {
    const doc = await h.ready(h.ticket);
    expect(doc).not.toHaveProperty('storageKey');
    const response = await h.send(h.driver, 'get', `/documents/${doc.id}/content`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="[a-z0-9_-]+\.pdf"$/,
    );
    expect(Number(response.headers['content-length'])).toBe(response.body.length);
  });
});

import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { documentHarness, page, problem, attemptResource } from '../../support/document-harness.js';

describe('T119 history OpenAPI contract', () => {
  it('defines bounded opaque history pages and every supported filter', async () => {
    const text = await readFile(
      new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url),
      'utf8',
    );
    for (const value of [
      'operationId: listDocuments',
      'operationId: listOutputAttempts',
      'operationId: getOutputAttempt',
      'default: 25',
      'maximum: 100',
      'nextCursor:',
      'hasNextPage:',
      'name: documentType',
      'name: sourceType',
      'name: sourceId',
      'name: documentId',
      'name: mode',
      'name: state',
      'name: from',
      'name: to',
    ])
      expect(text).toContain(value);
  });
});

describe('T119 source-scoped document and attempt history (red until T127)', () => {
  let h: Awaited<ReturnType<typeof documentHarness>>;
  beforeAll(async () => {
    h = await documentHarness();
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  });
  const query = (values: Record<string, string | number>) =>
    new URLSearchParams(
      Object.entries(values).map(([key, value]) => [key, String(value)]),
    ).toString();
  it.each(['CASH_CLOSE', 'REPORT'])(
    'denies Driver document type filter %s',
    async (documentType) => {
      problem(await h.send(h.driver, 'get', `/documents?documentType=${documentType}`), 403);
    },
  );
  it('does not let an own-source cursor select another Driver source', async () => {
    await history();
    const first = page(await h.send(h.driver, 'get', '/documents?limit=1'), 'documents');
    expect(first.page.nextCursor).toEqual(expect.any(String));
    problem(
      await h.send(
        h.driver,
        'get',
        `/documents?${query({ limit: 1, cursor: first.page.nextCursor!, sourceId: h.foreignTicket.sourceId })}`,
      ),
      403,
    );
  }, 60_000);
  it.each(['STARTED', 'FAILED', 'UNKNOWN'])(
    'filters attempt state %s without returning other states',
    async (state) => {
      const doc = await h.ready(h.ticket);
      const response = await h.command(h.admin, '/output-attempts', {
        documentId: doc.id,
        mode: 'PRINT',
        printerProfileId: h.printerProfileId,
        state,
      });
      expect(response.status).toBe(201);
      const attempt = attemptResource.parse(response.body.data);
      const result = page(
        await h.send(h.driver, 'get', `/output-attempts?${query({ documentId: doc.id, state })}`),
        'attempts',
      );
      expect(result.data.map((row) => row.id)).toContain(attempt.id);
      expect(result.data.every((row) => row.state === state)).toBe(true);
    },
    15_000,
  );
  let seeded: { documentIds: string[]; attemptIds: string[] } | undefined;
  async function history() {
    if (seeded) return seeded;
    const documentIds: string[] = [],
      attemptIds: string[] = [];
    for (let index = 0; index < 27; index++) {
      const doc = await h.ready(await h.newSale());
      documentIds.push(doc.id);
      attemptIds.push((await h.attempt(doc.id)).id);
    }
    seeded = { documentIds, attemptIds };
    return seeded;
  }
  function ordered(rows: Array<{ id: string; createdAt: string }>) {
    expect(rows).toEqual(
      [...rows].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id),
      ),
    );
  }
  it.each(['documents', 'output-attempts'])(
    '%s defaults to 25, accepts 100 and traverses without duplicate IDs',
    async (endpoint) => {
      const seeds = await history();
      const kind = endpoint === 'documents' ? 'documents' : 'attempts';
      const first = page(await h.send(h.admin, 'get', `/${endpoint}`), kind);
      expect(first.data).toHaveLength(25);
      expect(first.page).toMatchObject({ hasNextPage: true, nextCursor: expect.any(String) });
      expect(first.page.nextCursor).not.toBe(first.data.at(-1)!.id);
      ordered(first.data);
      const ids = first.data.map((row) => row.id);
      let cursor = first.page.nextCursor;
      for (let pages = 0; cursor && pages < 20; pages++) {
        const next = page(
          await h.send(h.admin, 'get', `/${endpoint}?${query({ cursor, limit: 100 })}`),
          kind,
        );
        ordered(next.data);
        expect(next.data.length).toBeLessThanOrEqual(100);
        ids.push(...next.data.map((row) => row.id));
        expect(next.page.hasNextPage).toBe(next.page.nextCursor !== null);
        cursor = next.page.nextCursor;
      }
      expect(cursor).toBeNull();
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of kind === 'documents' ? seeds.documentIds : seeds.attemptIds)
        expect(ids).toContain(id);
    },
    60_000,
  );
  it.each(['documents', 'output-attempts'])(
    '%s validates pagination and malformed filters',
    async (endpoint) => {
      for (const params of [
        'limit=101',
        'limit=0',
        'limit=-1',
        'limit=1.5',
        'cursor=not-a-valid-cursor',
        'state=INVALID',
        'from=not-a-date',
        'to=not-a-date',
      ])
        problem(await h.send(h.admin, 'get', `/${endpoint}?${params}`), 422);
    },
  );
  it.each(['documents', 'output-attempts'])(
    '%s binds cursors to principal and filters and rejects tampering',
    async (endpoint) => {
      await history();
      const kind = endpoint === 'documents' ? 'documents' : 'attempts';
      const filter = kind === 'documents' ? { documentType: 'TICKET' } : { mode: 'DOWNLOAD' };
      const first = page(
        await h.send(h.admin, 'get', `/${endpoint}?${query({ ...filter, limit: 1 })}`),
        kind,
      );
      const cursor = first.page.nextCursor!;
      expect(cursor).toEqual(expect.any(String));
      problem(
        await h.send(h.driver, 'get', `/${endpoint}?${query({ ...filter, limit: 1, cursor })}`),
        403,
      );
      const changed = kind === 'documents' ? { documentType: 'REPORT' } : { mode: 'PRINT' };
      problem(
        await h.send(h.admin, 'get', `/${endpoint}?${query({ ...changed, limit: 1, cursor })}`),
        403,
      );
      problem(
        await h.send(
          h.admin,
          'get',
          `/${endpoint}?${query({ ...filter, cursor: `${cursor}tampered` })}`,
        ),
        422,
      );
    },
    60_000,
  );
  it('filters documents by type, state, source and time with a stable response shape', async () => {
    const doc = await h.ready(h.ticket);
    const params = {
      documentType: 'TICKET',
      state: 'READY',
      sourceType: 'SALE',
      sourceId: h.ticket.sourceId,
      from: '2000-01-01T00:00:00Z',
      to: '2100-01-01T00:00:00Z',
    };
    const result = page(await h.send(h.driver, 'get', `/documents?${query(params)}`), 'documents');
    expect(result.data.map((row) => row.id)).toEqual([doc.id]);
    expect(result.page).toEqual({ hasNextPage: false, nextCursor: null });
    const empty = page(
      await h.send(
        h.driver,
        'get',
        `/documents?${query({ ...params, to: '2001-01-01T00:00:00Z' })}`,
      ),
      'documents',
    );
    expect(empty.data).toEqual([]);
  }, 15_000);
  it('filters attempts by document, mode, state and time and exposes authorized detail', async () => {
    const doc = await h.ready(h.ticket);
    const attempt = await h.attempt(doc.id, 'SHARE');
    const params = {
      documentId: doc.id,
      mode: 'SHARE',
      state: 'SUCCEEDED',
      from: '2000-01-01T00:00:00Z',
      to: '2100-01-01T00:00:00Z',
    };
    const result = page(
      await h.send(h.driver, 'get', `/output-attempts?${query(params)}`),
      'attempts',
    );
    expect(result.data.map((row) => row.id)).toContain(attempt.id);
    for (const row of result.data)
      expect(row).toMatchObject({ documentId: doc.id, mode: 'SHARE', state: 'SUCCEEDED' });
    const detail = await h.send(h.driver, 'get', `/output-attempts/${attempt.id}`);
    expect(detail.status).toBe(200);
    expect(attemptResource.parse(detail.body.data)).toEqual(attempt);
    const empty = page(
      await h.send(
        h.driver,
        'get',
        `/output-attempts?${query({ ...params, to: '2001-01-01T00:00:00Z' })}`,
      ),
      'attempts',
    );
    expect(empty.data).toEqual([]);
  }, 15_000);
  it.each(['ticket', 'load'] as const)(
    'Driver sees Administrator-created %s document and attempt history',
    async (key) => {
      const doc = await h.ready(h[key]);
      const attempt = await h.attempt(doc.id);
      expect(doc.createdBy).toBe(h.admin.id);
      expect(attempt.actorId).toBe(h.admin.id);
      const docs = page(
        await h.send(h.driver, 'get', `/documents?${query({ sourceId: h[key].sourceId })}`),
        'documents',
      );
      expect(docs.data.map((row) => row.id)).toContain(doc.id);
      const attempts = page(
        await h.send(h.driver, 'get', `/output-attempts?documentId=${doc.id}`),
        'attempts',
      );
      expect(attempts.data.map((row) => row.id)).toContain(attempt.id);
    },
    15_000,
  );
  it.each(['foreignTicket', 'foreignLoad', 'cashClose', 'reportSource'] as const)(
    'excludes %s from Driver lists and denies filters and direct attempt access',
    async (key) => {
      const doc = await h.ready(h[key]);
      const attempt = await h.attempt(doc.id);
      const docs = page(await h.send(h.driver, 'get', '/documents?limit=100'), 'documents');
      expect(docs.data.map((row) => row.id)).not.toContain(doc.id);
      const attempts = page(
        await h.send(h.driver, 'get', '/output-attempts?limit=100'),
        'attempts',
      );
      expect(attempts.data.map((row) => row.id)).not.toContain(attempt.id);
      problem(
        await h.send(
          h.driver,
          'get',
          `/documents?sourceId=${h[key].sourceId}&sourceType=${h[key].sourceType}`,
        ),
        403,
      );
      problem(await h.send(h.driver, 'get', `/output-attempts?documentId=${doc.id}`), 403);
      problem(await h.send(h.driver, 'get', `/output-attempts/${attempt.id}`), 403);
      expect((await h.send(h.admin, 'get', `/output-attempts/${attempt.id}`)).status).toBe(200);
    },
    15_000,
  );
  it('keeps TEST_PRINT history Administrator-only even for the Driver who recorded it', async () => {
    const response = await h.command(h.driver, '/output-attempts', {
      mode: 'TEST_PRINT',
      printerProfileId: h.printerProfileId,
      state: 'SUCCEEDED',
    });
    expect(response.status).toBe(201);
    const attempt = attemptResource.parse(response.body.data);
    expect(attempt.documentId ?? null).toBeNull();
    const adminPage = page(
      await h.send(h.admin, 'get', '/output-attempts?mode=TEST_PRINT'),
      'attempts',
    );
    expect(adminPage.data.map((row) => row.id)).toContain(attempt.id);
    expect((await h.send(h.admin, 'get', `/output-attempts/${attempt.id}`)).status).toBe(200);
    problem(await h.send(h.driver, 'get', `/output-attempts/${attempt.id}`), 403);
    problem(await h.send(h.driver, 'get', '/output-attempts?mode=TEST_PRINT'), 403);
    const driverPage = page(await h.send(h.driver, 'get', '/output-attempts'), 'attempts');
    expect(driverPage.data.every((row) => 'mode' in row && row.mode !== 'TEST_PRINT')).toBe(true);
  });
});

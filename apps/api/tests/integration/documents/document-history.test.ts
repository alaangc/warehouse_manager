import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  documentIntegrationHarness,
  historyQuery,
  type DocumentIntegrationHarness,
} from '../../support/document-integration-harness.js';
import { page, problem } from '../../support/document-harness.js';

describe('T120 database-backed document history (red until T123–T127)', () => {
  let h: DocumentIntegrationHarness;
  beforeAll(async () => {
    h = await documentIntegrationHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  let seeded = false;
  async function seed() {
    if (seeded) return;
    for (let index = 0; index < 31; index++) {
      // Same milliseconds, different microseconds, plus exact ties requiring UUID order.
      // Never use Date to calculate the expected database order: it loses precision.
      const createdAt = `2036-06-01T00:00:00.00000${index % 3}Z`;
      const id = await h.insertDocument(h.ticket, { createdAt });
      await h.insertAttempt({ documentId: id, documentType: 'TICKET', createdAt });
    }
    seeded = true;
  }
  const from = '2036-06-01T00:00:00Z';
  const to = '2036-06-02T00:00:00Z';

  it.each(['documents', 'output-attempts'] as const)(
    '%s matches PostgreSQL microsecond/UUID order across every page without gaps or duplicates',
    async (endpoint) => {
      await seed();
      const table = endpoint === 'documents' ? 'document_output' : 'output_attempt';
      const kind = endpoint === 'documents' ? 'documents' : 'attempts';
      const expected = (
        await sql<{ id: string }>`select id from ${sql.table(table)}
        where created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz
        order by created_at desc, id desc`.execute(h.database)
      ).rows.map((row) => row.id);
      expect(expected).toHaveLength(31);
      const defaultPage = page(
        await h.send(h.admin, 'get', `/${endpoint}?${historyQuery({ from, to })}`),
        kind,
      );
      expect(defaultPage.data.map((row) => row.id)).toEqual(expected.slice(0, 25));
      const collected: string[] = [];
      let cursor: string | null = null;
      for (let iteration = 0; iteration < 20; iteration++) {
        const params = { from, to, limit: 4, ...(cursor ? { cursor } : {}) };
        const result = page(
          await h.send(h.admin, 'get', `/${endpoint}?${historyQuery(params)}`),
          kind,
        );
        collected.push(...result.data.map((row) => row.id));
        expect(result.page.hasNextPage).toBe(result.page.nextCursor !== null);
        cursor = result.page.nextCursor;
        if (!cursor) break;
      }
      expect(cursor).toBeNull();
      expect(collected).toEqual(expected);
      expect(new Set(collected).size).toBe(collected.length);
      const all = page(
        await h.send(h.admin, 'get', `/${endpoint}?${historyQuery({ from, to, limit: 100 })}`),
        kind,
      );
      expect(all.data.map((row) => row.id)).toEqual(expected);
    },
  );

  it.each(['documents', 'output-attempts'] as const)(
    '%s remains stable when a newer row arrives between page requests',
    async (endpoint) => {
      await seed();
      const kind = endpoint === 'documents' ? 'documents' : 'attempts';
      const table = endpoint === 'documents' ? 'document_output' : 'output_attempt';
      const params = { from, to, limit: 100 };
      const expected = (
        await sql<{ id: string }>`select id from ${sql.table(table)}
        where created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz
        order by created_at desc, id desc`.execute(h.database)
      ).rows.map((row) => row.id);
      const first = page(
        await h.send(h.admin, 'get', `/${endpoint}?${historyQuery({ ...params, limit: 3 })}`),
        kind,
      );
      expect(first.page.nextCursor).toEqual(expect.any(String));
      const id = await h.insertDocument(h.ticket, { createdAt: '2036-06-01T12:00:00Z' });
      const added =
        endpoint === 'documents'
          ? id
          : await h.insertAttempt({
              documentId: id,
              documentType: 'TICKET',
              createdAt: '2036-06-01T12:00:00Z',
            });
      const rest = page(
        await h.send(
          h.admin,
          'get',
          `/${endpoint}?${historyQuery({ ...params, cursor: first.page.nextCursor! })}`,
        ),
        kind,
      );
      const ids = [...first.data, ...rest.data].map((row) => row.id);
      expect(ids).toEqual(expected);
      expect(ids).not.toContain(added);
      expect(rest.page.nextCursor).toBeNull();
    },
  );

  it.each(['documents', 'output-attempts'] as const)(
    '%s binds cursor to principal, role and normalized filters',
    async (endpoint) => {
      await seed();
      const kind = endpoint === 'documents' ? 'documents' : 'attempts';
      const filter: Record<string, string> =
        endpoint === 'documents'
          ? { sourceId: h.ticket.sourceId, sourceType: 'SALE' }
          : { mode: 'DOWNLOAD' };
      const params = { ...filter, from, to, limit: 2 };
      const first = page(
        await h.send(h.driver, 'get', `/${endpoint}?${historyQuery(params)}`),
        kind,
      );
      const cursor = first.page.nextCursor!;
      expect(cursor).toEqual(expect.any(String));
      const url = `/${endpoint}?${historyQuery({ ...params, cursor })}`;
      problem(await h.send(h.other, 'get', url), 403);
      // Changing a filter to another authorized scope still invalidates the cursor.
      problem(
        await h.send(
          h.driver,
          'get',
          `/${endpoint}?${historyQuery({ ...params, from: '2036-05-31T00:00:00Z', cursor })}`,
        ),
        403,
      );
      const equivalent = page(
        await h.send(
          h.driver,
          'get',
          `/${endpoint}?${historyQuery({ ...params, from: '2036-06-01T00:00:00.000Z', cursor })}`,
        ),
        kind,
      );
      expect(equivalent.data).toHaveLength(2);
      await h.database
        .updateTable('app_user')
        .set({ role: 'ADMINISTRATOR' })
        .where('id', '=', h.driver.id)
        .execute();
      try {
        expect((await h.send(h.driver, 'get', '/auth/session')).body.data.role).toBe(
          'ADMINISTRATOR',
        );
        problem(await h.send(h.driver, 'get', url), 403);
      } finally {
        await h.database
          .updateTable('app_user')
          .set({ role: 'DRIVER' })
          .where('id', '=', h.driver.id)
          .execute();
      }
    },
  );
});

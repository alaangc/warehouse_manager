import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DocumentRepository,
  type DocumentSource,
} from '../../../src/modules/documents/document-repository.js';
import { OutputAttemptRepository } from '../../../src/modules/documents/output-attempt-repository.js';
import { ScopedCursor } from '../../../src/shared/pagination/scoped-cursor.js';
import {
  documentIntegrationHarness,
  type DocumentIntegrationHarness,
} from '../../support/document-integration-harness.js';
import type { Source } from '../../support/document-harness.js';

describe('T124 document repositories, independent of document HTTP routes', () => {
  let h: DocumentIntegrationHarness;
  let documents: DocumentRepository;
  let attempts: OutputAttemptRepository;
  const cursors = new ScopedCursor('t124-isolated-test-secret-at-least-32-bytes');
  const admin = () => ({ id: h.admin.id, role: 'ADMINISTRATOR' as const });
  const driver = () => ({ id: h.driver.id, role: 'DRIVER' as const });
  const source = (value: Source) => value as DocumentSource;
  beforeAll(async () => {
    h = await documentIntegrationHarness();
    documents = new DocumentRepository(h.database, cursors);
    attempts = new OutputAttemptRepository(h.database, cursors);
  });
  afterAll(async () => {
    await h?.close();
  });

  it.each(['ticket', 'load', 'cashClose', 'reportSource'] as const)(
    'loads the persisted %s source without changing business data',
    async (key) => {
      const before = await h.businessState();
      const loaded = await documents.loadSource(admin(), source(h[key]));
      expect(loaded).toMatchObject({
        ...h[key],
        contentVersion: expect.any(String),
        snapshot: expect.any(Object),
      });
      expect(await h.businessState()).toEqual(before);
    },
  );

  it('keeps historical Ticket bytes independent of current catalog names and prices', async () => {
    const before = await documents.loadSource(driver(), source(h.ticket));
    const product = await h.database
      .selectFrom('sale_line')
      .select('product_id')
      .where('sale_id', '=', h.ticket.sourceId)
      .executeTakeFirstOrThrow();
    const transaction = await h.database.startTransaction().execute();
    try {
      await transaction
        .updateTable('product')
        .set({ name: 'Changed catalog', standard_unit_price: '999.00' })
        .where('id', '=', product.product_id)
        .execute();
      const current = await new DocumentRepository(transaction, cursors).loadSource(
        driver(),
        source(h.ticket),
      );
      expect(current).toEqual(before);
    } finally {
      await transaction.rollback().execute();
    }
  });

  it.each(['ticket', 'load'] as const)(
    'authorizes canonical %s reuse from the source, not the creator',
    async (key) => {
      const version = randomUUID();
      const first = await documents.createOrReuse(admin(), source(h[key]), version, 'a'.repeat(64));
      const second = await documents.createOrReuse(
        driver(),
        source(h[key]),
        version,
        'b'.repeat(64),
      );
      expect(second.id).toBe(first.id);
      expect(second.created_by).toBe(h.admin.id);
      expect(second.content_hash).toBe(first.content_hash);
      expect((await documents.detail(first.id, driver())).id).toBe(first.id);
      const attempt = await attempts.append(admin(), {
        documentId: first.id,
        mode: 'DOWNLOAD',
        state: 'SUCCEEDED',
        attemptNumber: 1,
        requestId: randomUUID(),
      });
      expect((await attempts.detail(attempt.id, driver())).id).toBe(attempt.id);
      expect(
        (await attempts.list(driver(), { documentId: first.id })).data.map((row) => row.id),
      ).toContain(attempt.id);
    },
  );

  it('concurrent canonical requests preserve one document', async () => {
    const version = randomUUID();
    const rows = await Promise.all(
      [admin(), driver(), admin()].map((actor) =>
        documents.createOrReuse(actor, source(h.ticket), version, 'a'.repeat(64)),
      ),
    );
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
  });

  it.each(['foreignTicket', 'foreignLoad', 'cashClose', 'reportSource'] as const)(
    'denies every direct and filtered %s lookup with no output changes',
    async (key) => {
      const id = await h.insertDocument(h[key], { createdBy: h.driver.id });
      const attemptId = await h.insertAttempt({
        documentId: id,
        documentType: h[key].documentType,
        actorId: h.driver.id,
      });
      const before = await h.outputState();
      const deny = (promise: Promise<unknown>) =>
        expect(promise).rejects.toMatchObject({ status: 403 });
      await deny(documents.loadSource(driver(), source(h[key])));
      await deny(documents.createOrReuse(driver(), source(h[key]), randomUUID(), 'a'.repeat(64)));
      await deny(documents.detail(id, driver()));
      await deny(
        documents.list(driver(), {
          sourceType: source(h[key]).sourceType,
          sourceId: h[key].sourceId,
        }),
      );
      await deny(documents.list(driver(), { sourceId: h[key].sourceId }));
      await deny(attempts.detail(attemptId, driver()));
      await deny(attempts.list(driver(), { documentId: id }));
      for (const mode of ['GENERATE', 'DOWNLOAD', 'SHARE', 'PRINT', 'REPRINT'] as const) {
        await deny(
          attempts.append(driver(), {
            documentId: id,
            mode,
            state: 'STARTED',
            attemptNumber: 1,
            requestId: randomUUID(),
          }),
        );
      }
      expect(
        (await documents.list(driver(), { limit: 100 })).data.map((row) => row.id),
      ).not.toContain(id);
      expect(
        (await attempts.list(driver(), { limit: 100 })).data.map((row) => row.id),
      ).not.toContain(attemptId);
      expect(await h.outputState()).toEqual(before);
    },
  );

  it('checks ownership before DRAFT state and creates no output on rejection', async () => {
    const before = await h.outputState();
    await expect(documents.createOrReuse(driver(), source(h.draft), '1', '')).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(documents.createOrReuse(admin(), source(h.draft), '1', '')).rejects.toMatchObject({
      status: 409,
      code: 'ROUTE_LOAD_NOT_CONFIRMED',
    });
    expect(await h.outputState()).toEqual(before);
  });

  it('keeps Driver TEST_PRINT attempts visible only in Administrator history', async () => {
    const row = await attempts.append(driver(), {
      mode: 'TEST_PRINT',
      state: 'UNKNOWN',
      printerProfileId: h.printerProfileId,
      attemptNumber: 991,
      requestId: randomUUID(),
    });
    expect((await attempts.detail(row.id, admin())).id).toBe(row.id);
    expect(
      (await attempts.list(admin(), { mode: 'TEST_PRINT' })).data.map((entry) => entry.id),
    ).toContain(row.id);
    await expect(attempts.detail(row.id, driver())).rejects.toMatchObject({ status: 403 });
    await expect(attempts.list(driver(), { mode: 'TEST_PRINT' })).rejects.toMatchObject({
      status: 403,
    });
    expect(
      (await attempts.list(driver(), { limit: 100 })).data.map((entry) => entry.id),
    ).not.toContain(row.id);
  });

  it('rejects REPORT printing after source authorization and requires a printer for tickets', async () => {
    const report = await h.insertDocument(h.reportSource);
    const ticket = await h.insertDocument(h.ticket);
    const before = await h.outputState();
    for (const mode of ['PRINT', 'REPRINT'] as const) {
      const input = {
        documentId: report,
        mode,
        state: 'UNKNOWN' as const,
        printerProfileId: h.printerProfileId,
        attemptNumber: 992,
        requestId: randomUUID(),
      };
      await expect(attempts.append(driver(), input)).rejects.toMatchObject({ status: 403 });
      await expect(attempts.append(admin(), input)).rejects.toMatchObject({ status: 422 });
      await expect(
        attempts.append(driver(), {
          ...input,
          documentId: ticket,
          printerProfileId: undefined,
        }),
      ).rejects.toMatchObject({ status: 422 });
    }
    expect(await h.outputState()).toEqual(before);
  });

  it.each(['documents', 'attempts'] as const)(
    '%s traverses exact PostgreSQL microseconds and UUID ties without duplicates',
    async (kind) => {
      const from = '2038-01-01T00:00:00Z';
      const to = '2038-01-02T00:00:00Z';
      const seededIds: string[] = [];
      for (let index = 0; index < 31; index++) {
        const createdAt = `2038-01-01T00:00:00.00000${index % 3}Z`;
        const id = await h.insertDocument(h.ticket, { createdAt });
        seededIds.push(
          kind === 'documents'
            ? id
            : await h.insertAttempt({ documentId: id, documentType: 'TICKET', createdAt }),
        );
      }
      const table = kind === 'documents' ? 'document_output' : 'output_attempt';
      const expected = (
        await sql<{
          id: string;
        }>`select id from ${sql.table(table)} where id in (${sql.join(seededIds)}) order by created_at desc, id desc`.execute(
          h.database,
        )
      ).rows.map((row) => row.id);
      const repository = kind === 'documents' ? documents : attempts;
      const first = await repository.list(driver(), { from, to });
      expect(first.data).toHaveLength(25);
      const collected: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await repository.list(driver(), {
          from,
          to,
          limit: 4,
          ...(cursor ? { cursor } : {}),
        });
        collected.push(...page.data.map((row) => row.id));
        cursor = page.page.nextCursor ?? undefined;
      } while (cursor && collected.length < 100);
      // Each parameterized case uses its own selected IDs; previous documents also share the range.
      expect(collected.filter((id) => seededIds.includes(id))).toEqual(expected);
      expect(new Set(collected).size).toBe(collected.length);
      expect(cursor).toBeUndefined();
      await expect(
        repository.list(admin(), { from, to, cursor: first.page.nextCursor! }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        repository.list(driver(), {
          from: '2037-01-01T00:00:00Z',
          to,
          cursor: first.page.nextCursor!,
        }),
      ).rejects.toMatchObject({ status: 403 });
      const equivalent = await repository.list(driver(), {
        from: '2037-12-31T17:00:00-07:00',
        to,
        limit: 100,
        cursor: first.page.nextCursor!,
      });
      expect(equivalent.page.nextCursor).toBeNull();
    },
  );
});

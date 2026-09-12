import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  documentIntegrationHarness,
  type DocumentIntegrationHarness,
} from '../../support/document-integration-harness.js';
import { problem } from '../../support/document-harness.js';

describe('T120 document database constraints and retry isolation (red until T123–T127)', () => {
  let h: DocumentIntegrationHarness;
  beforeAll(async () => {
    h = await documentIntegrationHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  it('builds committed sources without needing document implementation', async () => {
    expect(
      await h.database
        .selectFrom('route_load')
        .select('state')
        .where('id', '=', h.load.sourceId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'CONFIRMED' });
    expect(
      await h.database
        .selectFrom('route_load')
        .select('state')
        .where('id', '=', h.draft.sourceId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'DRAFT' });
    expect(await h.businessState()).toHaveProperty('sale');
  });

  it.each([0, 1, 2, 3])(
    'accepts valid document/source pair %s through direct SQL',
    async (index) => {
      await expect(h.insertDocument(h.sources[index]!)).resolves.toEqual(expect.any(String));
    },
  );

  it.each(
    [0, 1, 2, 3].flatMap((type) =>
      [0, 1, 2, 3].filter((source) => source !== type).map((source) => [type, source]),
    ),
  )('rejects mismatched document/source pair %s/%s through direct SQL', async (type, source) => {
    await expect(
      h.insertDocument({ ...h.sources[source]!, documentType: h.sources[type]!.documentType }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each([0, 1, 2, 3])('enforces source existence for pair %s', async (index) => {
    await expect(
      h.insertDocument({ ...h.sources[index]!, sourceId: randomUUID() }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects direct and concurrent inserts for an unconfirmed load', async () => {
    const writes = await Promise.allSettled([h.insertDocument(h.draft), h.insertDocument(h.draft)]);
    for (const write of writes) {
      expect(write.status).toBe('rejected');
      if (write.status === 'rejected')
        expect(write.reason).toMatchObject({ code: expect.stringMatching(/^(23514|P0001)$/) });
    }
    expect(
      (
        await sql<{
          count: number;
        }>`select count(*)::int as count from document_output where source_id = ${h.draft.sourceId}`.execute(
          h.database,
        )
      ).rows[0]!.count,
    ).toBe(0);
  });

  it('waits for a locked load and rejects output when the competing transaction leaves it DRAFT', async () => {
    await sql`select id from document_output limit 0`.execute(h.database);
    const lock = await h.database.startTransaction().execute();
    let insert: Promise<unknown> | undefined;
    try {
      await sql`select id from route_load where id = ${h.draft.sourceId} for update`.execute(lock);
      const pid = (await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(lock))
        .rows[0]!.pid;
      // Catch immediately so rejection is observed even when the expected table is absent.
      insert = h.insertDocument(h.draft).then(
        () => ({ success: true }),
        (error: unknown) => ({ error }),
      );
      await expect
        .poll(
          async () =>
            (
              await sql<{ blocked: boolean }>`
        select exists (select 1 from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))) as blocked
      `.execute(h.database)
            ).rows[0]!.blocked,
          { timeout: 2_000 },
        )
        .toBe(true);
      await lock.commit().execute();
      expect(await insert).toMatchObject({
        error: { code: expect.stringMatching(/^(23514|P0001)$/) },
      });
    } finally {
      if (!lock.isCommitted && !lock.isRolledBack) await lock.rollback().execute();
      await insert;
    }
  });

  it('allows only one canonical confirmed-load document under concurrent SQL inserts', async () => {
    const version = randomUUID();
    const writes = await Promise.allSettled([
      h.insertDocument(h.load, { version }),
      h.insertDocument(h.load, { version }),
    ]);
    expect(writes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = writes.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: '23505' } });
  });

  it.each(['PRINT', 'REPRINT'])(
    'requires a printer and rejects REPORT %s at the database boundary',
    async (mode) => {
      const ticket = await h.insertDocument(h.ticket);
      const report = await h.insertDocument(h.reportSource);
      await expect(
        h.insertAttempt({ documentId: ticket, documentType: 'TICKET', mode }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        h.insertAttempt({
          documentId: report,
          documentType: 'REPORT',
          mode,
          printerId: h.printerProfileId,
        }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        h.insertAttempt({
          documentId: ticket,
          documentType: 'TICKET',
          mode,
          printerId: h.printerProfileId,
        }),
      ).resolves.toEqual(expect.any(String));
    },
  );

  it.each([0, 1, 2, 3])('accepts printer-free portable attempts for source %s', async (index) => {
    const source = h.sources[index]!;
    const documentId = await h.insertDocument(source);
    for (const mode of ['GENERATE', 'DOWNLOAD', 'SHARE']) {
      await expect(
        h.insertAttempt({ documentId, documentType: source.documentType, mode }),
      ).resolves.toEqual(expect.any(String));
    }
  });

  it('requires matching document ID/type composite references, not an unrelated valid type', async () => {
    const ticket = await h.insertDocument(h.ticket);
    await expect(
      h.insertAttempt({ documentId: ticket, documentType: 'ROUTE_LOAD' }),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      h.insertAttempt({ documentId: randomUUID(), documentType: 'TICKET' }),
    ).rejects.toMatchObject({ code: '23503' });
    for (const reference of [{ documentId: ticket }, { documentType: 'TICKET' }, {}])
      await expect(h.insertAttempt(reference)).rejects.toMatchObject({ code: '23514' });
  });

  it('requires a printer and both document fields to be null for TEST_PRINT', async () => {
    await expect(
      h.insertAttempt({ mode: 'TEST_PRINT', printerId: h.printerProfileId }),
    ).resolves.toEqual(expect.any(String));
    for (const input of [
      { mode: 'TEST_PRINT' },
      { mode: 'TEST_PRINT', printerId: h.printerProfileId, documentId: randomUUID() },
      { mode: 'TEST_PRINT', printerId: h.printerProfileId, documentType: 'TICKET' },
    ])
      await expect(h.insertAttempt(input)).rejects.toMatchObject({ code: '23514' });
  });

  it('provides stable global and per-document history indexes', async () => {
    const indexes = (
      await sql<{ tablename: string; indexdef: string }>`
      select tablename, indexdef from pg_indexes where schemaname = 'public'
      and tablename in ('document_output', 'output_attempt')
    `.execute(h.database)
    ).rows;
    for (const table of ['document_output', 'output_attempt'])
      expect(
        indexes
          .filter((row) => row.tablename === table)
          .some((row) => /\(created_at DESC, id DESC\)/i.test(row.indexdef)),
      ).toBe(true);
    expect(
      indexes.some(
        (row) =>
          row.tablename === 'output_attempt' &&
          /\(document_output_id, created_at DESC, id DESC\)/i.test(row.indexdef),
      ),
    ).toBe(true);
  });

  it('keeps output attempts append-only', async () => {
    const id = await h.insertAttempt({ mode: 'TEST_PRINT', printerId: h.printerProfileId });
    const before = await h.rows('output_attempt');
    await expect(
      sql`update output_attempt set state = 'FAILED' where id = ${id}`.execute(h.database),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      sql`delete from output_attempt where id = ${id}`.execute(h.database),
    ).rejects.toMatchObject({ code: 'P0001' });
    expect(await h.rows('output_attempt')).toEqual(before);
  });

  it('rolls back failed output creation without undoing sources, then permits canonical retry', async () => {
    await sql`select id from document_output limit 0`.execute(h.database);
    const source = await h.newSale();
    const before = await h.businessState();
    await sql`create function fail_t120_output() returns trigger language plpgsql as $$
      begin raise exception 'Injected output persistence failure'; end $$`.execute(h.database);
    try {
      await sql`create trigger fail_t120_output before insert on document_output for each row execute function fail_t120_output()`.execute(
        h.database,
      );
      const failed = await h.command(h.admin, '/documents', source);
      problem(failed, 500);
      expect(await h.businessState()).toEqual(before);
      expect(
        (
          await sql<{
            count: number;
          }>`select count(*)::int as count from document_output where source_id = ${source.sourceId}`.execute(
            h.database,
          )
        ).rows[0]!.count,
      ).toBe(0);
    } finally {
      await sql`drop trigger if exists fail_t120_output on document_output`.execute(h.database);
      await sql`drop function fail_t120_output()`.execute(h.database);
    }
    const doc = await h.ready(source);
    const retries = await Promise.all([h.create(source), h.create(source, h.driver)]);
    expect(retries.map((row) => row.id)).toEqual([doc.id, doc.id]);
    await h
      .command(h.driver, '/output-attempts', {
        documentId: doc.id,
        mode: 'PRINT',
        printerProfileId: h.printerProfileId,
        state: 'UNKNOWN',
      })
      .expect(201);
    await h.attempt(doc.id, 'REPRINT', h.driver);
    expect(await h.businessState()).toEqual(before);
    expect(
      (
        await sql<{
          count: number;
        }>`select count(*)::int as count from document_output where source_id = ${source.sourceId}`.execute(
          h.database,
        )
      ).rows[0]!.count,
    ).toBe(1);
  });
});

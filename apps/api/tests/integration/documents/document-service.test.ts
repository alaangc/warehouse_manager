import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentService } from '../../../src/modules/documents/document-service.js';
import { renderDocumentPdf } from '../../../src/modules/documents/pdf-renderers.js';
import { ScopedCursor } from '../../../src/shared/pagination/scoped-cursor.js';
import {
  documentIntegrationHarness,
  type DocumentIntegrationHarness,
} from '../../support/document-integration-harness.js';

describe('T126 post-commit canonical document service', () => {
  let h: DocumentIntegrationHarness;
  let service: DocumentService;
  const cursors = new ScopedCursor('t126-document-service-secret-at-least-32-bytes');
  const admin = () => ({ id: h.admin.id, role: 'ADMINISTRATOR' as const });
  const driver = () => ({ id: h.driver.id, role: 'DRIVER' as const });
  beforeAll(async () => {
    h = await documentIntegrationHarness();
    service = new DocumentService(h.database, cursors, h.storage);
  });
  afterAll(async () => {
    await h?.close();
  });

  it.each(['ticket', 'load', 'cashClose', 'reportSource'] as const)(
    'generates and downloads committed %s without changing business records',
    async (key) => {
      const before = await h.businessState();
      const doc = await service.request(admin(), h[key], randomUUID());
      expect(doc.state).toBe('READY');
      expect(doc.ready_at).toBeInstanceOf(Date);
      const content = await service.content(admin(), doc.id);
      expect(content.bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(content.contentType).toBe('application/pdf');
      expect(content.filename).toMatch(/^[a-z_]+-[\da-f-]+-v[\da-f]+\.pdf$/);
      expect(createHash('sha256').update(content.bytes).digest('hex')).toBe(doc.content_hash);
      expect(await readFile(join(h.storage, doc.storage_key!))).toEqual(content.bytes);
      expect((await service.status(admin(), doc.id)).state).toBe('READY');
      expect(await h.businessState()).toEqual(before);
    },
  );

  it('serializes concurrent requests across service instances and reuses Administrator output', async () => {
    const source = await h.newSale();
    const render = vi.fn(renderDocumentPdf);
    const first = new DocumentService(h.database, cursors, h.storage, { render });
    const second = new DocumentService(h.database, cursors, h.storage, { render });
    const rows = await Promise.all([
      first.request(admin(), source, randomUUID()),
      second.request(admin(), source, randomUUID()),
      second.request(driver(), source, randomUUID()),
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
    expect(render).toHaveBeenCalledTimes(1);
    const reused = await service.request(driver(), source, randomUUID());
    expect(reused.id).toBe(rows[0]!.id);
    expect((await service.content(driver(), reused.id)).bytes.length).toBeGreaterThan(100);
    const attempts = await h.database
      .selectFrom('output_attempt')
      .selectAll()
      .where('document_output_id', '=', reused.id)
      .execute();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ mode: 'GENERATE', state: 'SUCCEEDED', attempt_number: 1 });
  });

  it.each(['foreignTicket', 'foreignLoad', 'cashClose', 'reportSource'] as const)(
    'denies new and existing %s before rendering, storage or accepted attempts',
    async (key) => {
      const render = vi.fn(renderDocumentPdf);
      const denied = new DocumentService(h.database, cursors, h.storage, { render });
      const before = await h.outputState();
      await expect(denied.request(driver(), h[key], randomUUID())).rejects.toMatchObject({
        status: 403,
      });
      expect(await h.outputState()).toEqual(before);
      const doc = await service.request(admin(), h[key], randomUUID());
      const existing = await h.outputState();
      await expect(denied.request(driver(), h[key], randomUUID())).rejects.toMatchObject({
        status: 403,
      });
      await expect(denied.status(driver(), doc.id)).rejects.toMatchObject({ status: 403 });
      await expect(denied.content(driver(), doc.id)).rejects.toMatchObject({ status: 403 });
      expect(render).not.toHaveBeenCalled();
      expect(await h.outputState()).toEqual(existing);
    },
  );

  it('rejects DRAFT after ownership checks and does not accept output', async () => {
    const before = await h.outputState();
    await expect(service.request(driver(), h.draft, randomUUID())).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.request(admin(), h.draft, randomUUID())).rejects.toMatchObject({
      status: 409,
      code: 'ROUTE_LOAD_NOT_CONFIRMED',
    });
    expect(await h.outputState()).toEqual(before);
  });

  it('records safe generation failure and retries the same canonical document', async () => {
    const source = await h.newSale();
    const before = await h.businessState();
    const render = vi
      .fn(renderDocumentPdf)
      .mockRejectedValueOnce(new Error('secret /private/path'));
    const flaky = new DocumentService(h.database, cursors, h.storage, { render });
    const failed = await flaky.request(admin(), source, randomUUID());
    expect(failed).toMatchObject({
      state: 'FAILED',
      last_error_code: 'DOCUMENT_GENERATION_FAILED',
      storage_key: null,
    });
    await expect(service.content(admin(), failed.id)).rejects.toMatchObject({ status: 409 });
    const retried = await flaky.request(admin(), source, randomUUID());
    expect(retried).toMatchObject({ id: failed.id, state: 'READY', last_error_code: null });
    const attempts = await h.database
      .selectFrom('output_attempt')
      .selectAll()
      .where('document_output_id', '=', failed.id)
      .orderBy('attempt_number')
      .execute();
    expect(attempts.map((row) => [row.state, row.attempt_number])).toEqual([
      ['FAILED', 1],
      ['SUCCEEDED', 2],
    ]);
    expect(JSON.stringify(attempts)).not.toContain('secret');
    expect(await h.businessState()).toEqual(before);
  });

  it('recovers an abandoned PENDING record on a later request', async () => {
    const source = await h.newSale();
    const failedService = new DocumentService(h.database, cursors, h.storage, {
      render: async () => {
        throw new Error('failure');
      },
    });
    const doc = await failedService.request(admin(), source, randomUUID());
    await h.database
      .updateTable('document_output')
      .set({ state: 'PENDING', last_error_code: null })
      .where('id', '=', doc.id)
      .execute();
    expect((await service.status(admin(), doc.id)).state).toBe('PENDING');
    expect(await service.request(admin(), source, randomUUID())).toMatchObject({
      id: doc.id,
      state: 'READY',
    });
  });

  it('handles storage failure without changing committed sources', async () => {
    const source = await h.newSale();
    const before = await h.businessState();
    const path = join(h.storage, 'not-a-directory');
    await writeFile(path, 'occupied');
    try {
      const broken = new DocumentService(h.database, cursors, path);
      const failed = await broken.request(admin(), source, randomUUID());
      expect(failed).toMatchObject({ state: 'FAILED', last_error_code: 'DOCUMENT_STORAGE_FAILED' });
      expect(await service.request(admin(), source, randomUUID())).toMatchObject({
        id: failed.id,
        state: 'READY',
      });
      expect(await h.businessState()).toEqual(before);
    } finally {
      await unlink(path);
    }
  });

  it('does not return corrupt or missing bytes and regenerates on explicit retry', async () => {
    const source = await h.newSale();
    const doc = await service.request(admin(), source, randomUUID());
    await writeFile(join(h.storage, doc.storage_key!), 'corrupt');
    await expect(service.content(admin(), doc.id)).rejects.toMatchObject({
      code: 'DOCUMENT_CONTENT_UNAVAILABLE',
    });
    const restored = await service.request(admin(), source, randomUUID());
    expect(restored.id).toBe(doc.id);
    expect((await service.content(admin(), doc.id)).bytes.subarray(0, 5).toString()).toBe('%PDF-');
    await unlink(join(h.storage, restored.storage_key!));
    await expect(service.content(admin(), doc.id)).rejects.toMatchObject({
      code: 'DOCUMENT_CONTENT_UNAVAILABLE',
    });
    expect((await service.request(admin(), source, randomUUID())).state).toBe('READY');
  });

  it('rolls back rejected persistence without changing committed sources', async () => {
    const source = await h.newSale();
    const before = await h.businessState();
    const outputs = await h.outputState();
    await sql`create function fail_t126_insert() returns trigger language plpgsql as $$
      begin raise exception 'injected persistence failure'; end $$`.execute(h.database);
    await sql`create trigger fail_t126_insert before insert on document_output
      for each row execute function fail_t126_insert()`.execute(h.database);
    try {
      await expect(service.request(admin(), source, randomUUID())).rejects.toThrow();
      expect(await h.outputState()).toEqual(outputs);
      expect(await h.businessState()).toEqual(before);
    } finally {
      await sql`drop trigger fail_t126_insert on document_output`.execute(h.database);
      await sql`drop function fail_t126_insert()`.execute(h.database);
    }
    expect((await service.request(admin(), source, randomUUID())).state).toBe('READY');
  });

  it('rejects invalid source input before creating output', async () => {
    const before = await h.outputState();
    for (const source of [
      { ...h.ticket, sourceType: 'ROUTE_LOAD' },
      { ...h.ticket, sourceId: '../escape' },
    ]) {
      await expect(service.request(admin(), source, randomUUID())).rejects.toThrow();
    }
    expect(await h.outputState()).toEqual(before);
  });

  it('does not publish READY when attempt persistence fails and recovers after rollback', async () => {
    const source = await h.newSale();
    const before = await h.businessState();
    await sql`create function fail_t126_attempt() returns trigger language plpgsql as $$
      begin raise exception 'injected attempt failure'; end $$`.execute(h.database);
    await sql`create trigger fail_t126_attempt before insert on output_attempt
      for each row execute function fail_t126_attempt()`.execute(h.database);
    try {
      await expect(service.request(admin(), source, randomUUID())).rejects.toThrow();
      const pending = await h.database
        .selectFrom('document_output')
        .selectAll()
        .where('source_id', '=', source.sourceId)
        .executeTakeFirstOrThrow();
      expect(pending).toMatchObject({ state: 'PENDING', storage_key: null, ready_at: null });
      expect(
        await h.database
          .selectFrom('output_attempt')
          .select('id')
          .where('document_output_id', '=', pending.id)
          .execute(),
      ).toHaveLength(0);
      await expect(service.content(admin(), pending.id)).rejects.toMatchObject({
        code: 'DOCUMENT_NOT_READY',
      });
      expect(await h.businessState()).toEqual(before);
    } finally {
      await sql`drop trigger fail_t126_attempt on output_attempt`.execute(h.database);
      await sql`drop function fail_t126_attempt()`.execute(h.database);
    }
    expect((await service.request(admin(), source, randomUUID())).state).toBe('READY');
    expect(
      await h.database
        .selectFrom('document_output')
        .select('id')
        .where('source_id', '=', source.sourceId)
        .execute(),
    ).toHaveLength(1);
  });

  it('refuses to run within an uncommitted business transaction', async () => {
    await h.database.transaction().execute(async (transaction) => {
      expect(() => new DocumentService(transaction, cursors, h.storage)).toThrow(
        'Document generation requires a database outside the source transaction',
      );
    });
  });

  it('rejects substituted storage keys without returning bytes', async () => {
    const source = await h.newSale();
    const doc = await service.request(admin(), source, randomUUID());
    await h.database
      .updateTable('document_output')
      .set({ storage_key: '../outside.pdf' })
      .where('id', '=', doc.id)
      .execute();
    await expect(service.content(admin(), doc.id)).rejects.toMatchObject({
      code: 'DOCUMENT_CONTENT_UNAVAILABLE',
    });
    expect((await service.request(admin(), source, randomUUID())).storage_key).toBe(
      doc.storage_key,
    );
  });
});

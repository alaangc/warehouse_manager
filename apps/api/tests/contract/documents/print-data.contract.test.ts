import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ThermalDocumentSchema } from '@warehouse/contracts';
import { documentHarness, problem } from '../../support/document-harness.js';

describe('T132 authorized thermal snapshots', () => {
  let h: Awaited<ReturnType<typeof documentHarness>>;
  beforeAll(async () => {
    h = await documentHarness();
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  });
  it('returns immutable, version-bound printable data without storage keys', async () => {
    for (const source of [h.ticket, h.load, h.cashClose]) {
      const doc = await h.ready(source);
      const response = await h.send(h.admin, 'get', `/documents/${doc.id}/print-data`);
      expect(response.status).toBe(200);
      expect(ThermalDocumentSchema.safeParse(response.body.data).success).toBe(true);
      expect(response.body.data.contentVersion).toBe(doc.contentVersion);
      expect(response.body.data).not.toHaveProperty('storageKey');
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
  });
  it('allows source-scoped Driver access to Administrator-created output', async () => {
    for (const source of [h.ticket, h.load]) {
      const doc = await h.ready(source);
      expect((await h.send(h.driver, 'get', `/documents/${doc.id}/print-data`)).status).toBe(200);
    }
  });
  it('authorizes before rejecting report capability and rejects unready print acceptance', async () => {
    const report = await h.ready(h.reportSource);
    problem(await h.send(h.driver, 'get', `/documents/${report.id}/print-data`), 403);
    problem(await h.send(h.admin, 'get', `/documents/${report.id}/print-data`), 422);
    const doc = await h.ready(h.ticket);
    await h.database
      .updateTable('document_output')
      .set({ state: 'FAILED' })
      .where('id', '=', doc.id)
      .execute();
    problem(await h.send(h.driver, 'get', `/documents/${doc.id}/print-data`), 409);
    problem(
      await h.command(h.driver, '/output-attempts', {
        documentId: doc.id,
        mode: 'PRINT',
        state: 'STARTED',
        printerProfileId: h.printerProfileId,
      }),
      409,
    );
  });
});

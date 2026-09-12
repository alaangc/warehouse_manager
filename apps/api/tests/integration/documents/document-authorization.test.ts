import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  documentIntegrationHarness,
  historyQuery,
  type DocumentIntegrationHarness,
} from '../../support/document-integration-harness.js';
import { page, problem } from '../../support/document-harness.js';

describe('T120 immutable-source authorization and side-effect isolation (red until T123–T127)', () => {
  let h: DocumentIntegrationHarness;
  beforeAll(async () => {
    h = await documentIntegrationHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  it.each(['ticket', 'load'] as const)(
    'permits Driver reuse and history for Administrator-created %s, independent of attempt actor',
    async (key) => {
      const source = h[key];
      const doc = await h.ready(source);
      const adminAttempt = await h.attempt(doc.id, 'DOWNLOAD');
      const before = await h.businessState();
      const reused = await h.create(source, h.driver);
      expect(reused.id).toBe(doc.id);
      expect(reused.createdBy).toBe(h.admin.id);
      const ownAttempt = await h.attempt(doc.id, 'SHARE', h.driver);
      const docs = page(
        await h.send(
          h.driver,
          'get',
          `/documents?${historyQuery({ sourceId: source.sourceId, sourceType: source.sourceType })}`,
        ),
        'documents',
      );
      expect(docs.data.map((row) => row.id)).toContain(doc.id);
      const attempts = page(
        await h.send(h.driver, 'get', `/output-attempts?documentId=${doc.id}`),
        'attempts',
      );
      expect(attempts.data.map((row) => row.id)).toEqual(
        expect.arrayContaining([adminAttempt.id, ownAttempt.id]),
      );
      for (const id of [adminAttempt.id, ownAttempt.id]) {
        const detail = await h.send(h.driver, 'get', `/output-attempts/${id}`);
        expect(detail.status).toBe(200);
        expect(detail.body.data.id).toBe(id);
      }
      const content = await h.send(h.driver, 'get', `/documents/${doc.id}/content`);
      expect(content.status).toBe(200);
      expect(content.headers['content-type']).toContain('application/pdf');
      expect(await h.businessState()).toEqual(before);
    },
  );

  it.each(['foreignTicket', 'foreignLoad', 'cashClose', 'reportSource'] as const)(
    'denies new and existing %s on every surface without metadata, bytes, persisted output or file changes',
    async (key) => {
      const source = h[key];
      // Before canonical output exists, denial must not create anything.
      const business = await h.businessState();
      const empty = await h.outputState();
      problem(await h.command(h.driver, '/documents', source), 403);
      expect(await h.outputState()).toEqual(empty);
      const doc = await h.ready(source);
      const attempt = await h.attempt(doc.id);
      const before = await h.outputState();
      const denied = async (response: Awaited<ReturnType<typeof h.send>>) => {
        problem(response, 403);
        expect(response.headers['content-type']).not.toContain('application/pdf');
        // RFC 9457 instance identifies the caller's URL; it is not leaked source metadata.
        const { instance, ...details } = response.body;
        void instance;
        for (const secret of [source.sourceId, doc.contentHash].filter(Boolean))
          expect(JSON.stringify(details)).not.toContain(secret);
      };
      await denied(await h.command(h.driver, '/documents', source));
      for (const suffix of ['', '/content'])
        await denied(await h.send(h.driver, 'get', `/documents/${doc.id}${suffix}`));
      await denied(
        await h.send(
          h.driver,
          'get',
          `/documents?${historyQuery({ sourceId: source.sourceId, sourceType: source.sourceType })}`,
        ),
      );
      await denied(await h.send(h.driver, 'get', `/output-attempts?documentId=${doc.id}`));
      await denied(await h.send(h.driver, 'get', `/output-attempts/${attempt.id}`));
      for (const mode of ['GENERATE', 'DOWNLOAD', 'SHARE', 'PRINT', 'REPRINT']) {
        await denied(
          await h.command(h.driver, '/output-attempts', {
            documentId: doc.id,
            mode,
            state: 'STARTED',
            ...(['PRINT', 'REPRINT'].includes(mode)
              ? { printerProfileId: h.printerProfileId }
              : {}),
          }),
        );
      }
      const docs = page(await h.send(h.driver, 'get', '/documents?limit=100'), 'documents');
      const attempts = page(
        await h.send(h.driver, 'get', '/output-attempts?limit=100'),
        'attempts',
      );
      expect(docs.data.map((row) => row.id)).not.toContain(doc.id);
      expect(attempts.data.map((row) => row.id)).not.toContain(attempt.id);
      expect(await h.outputState()).toEqual(before);
      expect(await h.businessState()).toEqual(business);
    },
  );

  it('does not grant access just because a forbidden source names the Driver as output creator or attempt actor', async () => {
    const id = await h.insertDocument(h.foreignTicket, { createdBy: h.driver.id });
    const attempt = await h.insertAttempt({
      documentId: id,
      documentType: 'TICKET',
      actorId: h.driver.id,
    });
    const before = await h.outputState();
    problem(await h.send(h.driver, 'get', `/documents/${id}`), 403);
    problem(await h.send(h.driver, 'get', `/output-attempts/${attempt}`), 403);
    const documents = page(await h.send(h.driver, 'get', '/documents?limit=100'), 'documents');
    const attempts = page(await h.send(h.driver, 'get', '/output-attempts?limit=100'), 'attempts');
    expect(documents.data.map((row) => row.id)).not.toContain(id);
    expect(attempts.data.map((row) => row.id)).not.toContain(attempt);
    expect((await h.send(h.admin, 'get', `/documents/${id}`)).status).toBe(200);
    expect((await h.send(h.admin, 'get', `/output-attempts/${attempt}`)).status).toBe(200);
    expect(await h.outputState()).toEqual(before);
  });

  it('keeps Driver-created TEST_PRINT out of Driver history but visible to Administrators', async () => {
    const response = await h.command(h.driver, '/output-attempts', {
      mode: 'TEST_PRINT',
      printerProfileId: h.printerProfileId,
      state: 'UNKNOWN',
    });
    expect(response.status).toBe(201);
    const id = response.body.data.id;
    const before = await h.rows('output_attempt');
    problem(await h.send(h.driver, 'get', `/output-attempts/${id}`), 403);
    problem(await h.send(h.driver, 'get', '/output-attempts?mode=TEST_PRINT'), 403);
    expect(
      page(await h.send(h.driver, 'get', '/output-attempts?limit=100'), 'attempts').data.map(
        (row) => row.id,
      ),
    ).not.toContain(id);
    expect(
      page(await h.send(h.admin, 'get', '/output-attempts?mode=TEST_PRINT'), 'attempts').data.map(
        (row) => row.id,
      ),
    ).toContain(id);
    expect((await h.send(h.admin, 'get', `/output-attempts/${id}`)).status).toBe(200);
    expect(await h.rows('output_attempt')).toEqual(before);
  });

  it('authorizes before DRAFT validation and persists nothing on either denial', async () => {
    const before = await h.outputState();
    const business = await h.businessState();
    problem(await h.command(h.other, '/documents', h.draft), 403);
    for (const actor of [h.admin, h.draftDriver]) {
      const response = await h.command(actor, '/documents', h.draft);
      problem(response, 409);
      expect(response.body.code).toBe('ROUTE_LOAD_NOT_CONFIRMED');
    }
    expect(await h.outputState()).toEqual(before);
    expect(await h.businessState()).toEqual(business);
  });

  it.each(['PRINT', 'REPRINT'])(
    'rejects REPORT %s after authorization without accepting output',
    async (mode) => {
      const doc = await h.ready(h.reportSource);
      const before = await h.outputState();
      const business = await h.businessState();
      const body = {
        documentId: doc.id,
        mode,
        printerProfileId: h.printerProfileId,
        state: 'STARTED',
      };
      problem(await h.command(h.driver, '/output-attempts', body), 403);
      problem(await h.command(h.admin, '/output-attempts', body), 422);
      expect(await h.outputState()).toEqual(before);
      expect(await h.businessState()).toEqual(business);
    },
  );
});

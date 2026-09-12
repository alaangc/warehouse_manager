import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  documentHarness,
  documentTypes,
  documentResource,
  problem,
} from '../../support/document-harness.js';

describe('T119 document OpenAPI contract', () => {
  it('documents all four pairs, the sole TICKET sale type and portable content', async () => {
    const contract = await readFile(
      new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url),
      'utf8',
    );
    for (const operation of [
      'requestDocument',
      'getDocument',
      'downloadDocument',
      'listDocuments',
      'listOutputAttempts',
      'getOutputAttempt',
    ])
      expect(contract).toContain(`operationId: ${operation}`);
    expect(contract).toContain('enum: [TICKET, ROUTE_LOAD, CASH_CLOSE, REPORT]');
    for (const source of ['SALE', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT_SNAPSHOT'])
      expect(contract).toContain(`const: ${source}`);
    expect(contract).toContain('application/pdf:');
    expect(contract).toContain('ROUTE_LOAD_NOT_CONFIRMED');
  });
});

describe('T119 document HTTP contract (red until T127)', () => {
  let h: Awaited<ReturnType<typeof documentHarness>>;
  beforeAll(async () => {
    h = await documentHarness();
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  });

  it('builds committed source fixtures independently of document implementation', () => {
    expect(h.sources.map((source) => source.documentType)).toEqual(documentTypes);
    expect(h.driver.id).not.toBe(h.other.id);
  });
  it.each(documentTypes)(
    'Administrator generates, polls, downloads and shares %s',
    async (type) => {
      const source = h.sources.find((row) => row.documentType === type)!;
      const doc = await h.ready(source);
      const response = await h.send(h.admin, 'get', `/documents/${doc.id}/content`);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toMatch(/attachment;.*filename/i);
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
      for (const mode of ['GENERATE', 'DOWNLOAD', 'SHARE'])
        expect(await h.attempt(doc.id, mode)).toMatchObject({ documentId: doc.id, mode });
    },
    15_000,
  );
  it.each(['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE'])(
    'Administrator can PRINT and REPRINT %s',
    async (type) => {
      const doc = await h.ready(h.sources.find((source) => source.documentType === type)!);
      for (const mode of ['PRINT', 'REPRINT'])
        expect(await h.attempt(doc.id, mode)).toMatchObject({
          mode,
          printerProfileId: h.printerProfileId,
        });
    },
    15_000,
  );
  it.each([0, 1])(
    'Driver reuses Administrator-created own/assigned source %s and its content',
    async (index) => {
      const source = h.sources[index]!;
      const existing = await h.ready(source);
      const reused = await h.create(source, h.driver);
      expect(reused.id).toBe(existing.id);
      expect(reused.createdBy).toBe(h.admin.id);
      const detail = await h.send(h.driver, 'get', `/documents/${existing.id}`);
      expect(detail.status).toBe(200);
      expect(documentResource.parse(detail.body.data).id).toBe(existing.id);
      expect((await h.send(h.driver, 'get', `/documents/${existing.id}/content`)).status).toBe(200);
      for (const mode of ['DOWNLOAD', 'SHARE', 'PRINT', 'REPRINT'])
        await h.attempt(existing.id, mode, h.driver);
    },
    15_000,
  );
  it.each(['foreignTicket', 'foreignLoad', 'cashClose', 'reportSource'] as const)(
    'denies Driver %s before creation and canonical reuse',
    async (key) => {
      const source = h[key];
      problem(await h.command(h.driver, '/documents', source), 403);
      const doc = await h.create(source);
      problem(await h.command(h.driver, '/documents', source), 403);
      for (const suffix of ['', '/content'])
        problem(await h.send(h.driver, 'get', `/documents/${doc.id}${suffix}`), 403);
      for (const mode of ['GENERATE', 'DOWNLOAD', 'SHARE', 'PRINT', 'REPRINT']) {
        problem(
          await h.command(h.driver, '/output-attempts', {
            documentId: doc.id,
            mode,
            state: 'STARTED',
            ...(['PRINT', 'REPRINT'].includes(mode)
              ? { printerProfileId: h.printerProfileId }
              : {}),
          }),
          403,
        );
      }
    },
  );
  it('checks source authorization before draft-load state', async () => {
    problem(await h.command(h.other, '/documents', h.draft), 403);
    for (const actor of [h.admin, h.draftDriver]) {
      const response = await h.command(actor, '/documents', h.draft);
      problem(response, 409);
      expect(response.body.code).toBe('ROUTE_LOAD_NOT_CONFIRMED');
    }
  });
  it.each(['PRINT', 'REPRINT'])(
    'authorizes REPORT before rejecting %s capability',
    async (mode) => {
      const doc = await h.create(h.reportSource);
      const body = {
        documentId: doc.id,
        mode,
        printerProfileId: h.printerProfileId,
        state: 'STARTED',
      };
      problem(await h.command(h.driver, '/output-attempts', body), 403);
      problem(await h.command(h.admin, '/output-attempts', body), 422);
    },
  );
  it('does not persist an accepted attempt for forbidden or non-printable sources', async () => {
    const doc = await h.create(h.reportSource);
    const before = await h.database.selectFrom('output_attempt').selectAll().execute();
    const body = {
      documentId: doc.id,
      mode: 'PRINT',
      printerProfileId: h.printerProfileId,
      state: 'STARTED',
    };
    problem(await h.command(h.driver, '/output-attempts', body), 403);
    problem(await h.command(h.admin, '/output-attempts', body), 422);
    const after = await h.database.selectFrom('output_attempt').selectAll().execute();
    expect(after).toEqual(before);
  });
  it('requires a printer for PRINT but forbids documents on TEST_PRINT', async () => {
    const doc = await h.ready(h.ticket);
    problem(
      await h.command(h.admin, '/output-attempts', {
        documentId: doc.id,
        mode: 'PRINT',
        state: 'STARTED',
      }),
      422,
    );
    problem(
      await h.command(h.admin, '/output-attempts', {
        documentId: doc.id,
        mode: 'TEST_PRINT',
        printerProfileId: h.printerProfileId,
        state: 'STARTED',
      }),
      422,
    );
  }, 15_000);
  const pairs = [
    ['TICKET', 'SALE'],
    ['ROUTE_LOAD', 'ROUTE_LOAD'],
    ['CASH_CLOSE', 'CASH_CLOSE'],
    ['REPORT', 'REPORT_SNAPSHOT'],
  ];
  it.each(
    pairs.flatMap(([type, valid]) =>
      pairs.filter(([, source]) => source !== valid).map(([, source]) => [type, source]),
    ),
  )('rejects invalid pair %s/%s', async (documentType, sourceType) => {
    problem(
      await h.command(h.admin, '/documents', {
        documentType,
        sourceType,
        sourceId: h.ticket.sourceId,
      }),
      422,
    );
  });
  it.each(['INVOICE', 'SALE_TICKET', 'SALE'])(
    'rejects unsupported sale-document type %s',
    async (documentType) => {
      problem(await h.command(h.admin, '/documents', { ...h.ticket, documentType }), 422);
    },
  );
  it('requires authentication on all document surfaces', async () => {
    for (const path of [
      '/documents',
      `/documents/${crypto.randomUUID()}`,
      `/documents/${crypto.randomUUID()}/content`,
      '/output-attempts',
      `/output-attempts/${crypto.randomUUID()}`,
    ])
      problem(await h.send(null, 'get', path), 401);
    problem(await h.send(null, 'post', '/documents', h.ticket), 401);
  });
});

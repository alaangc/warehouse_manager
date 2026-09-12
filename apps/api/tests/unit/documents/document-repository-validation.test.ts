import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/db/database.js';
import {
  DocumentRepository,
  normalizeHistoryFilters,
} from '../../../src/modules/documents/document-repository.js';
import { OutputAttemptRepository } from '../../../src/modules/documents/output-attempt-repository.js';
import { ScopedCursor } from '../../../src/shared/pagination/scoped-cursor.js';

// These rejections must occur before opening any database connection.
const database = createDatabase('postgresql://unused:unused@127.0.0.1:1/unused');
const cursors = new ScopedCursor('t124-validation-secret-at-least-thirty-two-bytes');
const documents = new DocumentRepository(database, cursors);
const attempts = new OutputAttemptRepository(database, cursors);
const driver = { id: '00000000-0000-4000-8000-000000000001', role: 'DRIVER' as const };
afterAll(async () => {
  await database.destroy();
});

describe('document repository validation before database access', () => {
  it.each(['CASH_CLOSE', 'REPORT'] as const)(
    'denies Driver %s source types and explicit history filters',
    async (documentType) => {
      await expect(
        documents.loadSource(driver, {
          documentType,
          sourceType: documentType === 'REPORT' ? 'REPORT_SNAPSHOT' : 'CASH_CLOSE',
          sourceId: driver.id,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(documents.list(driver, { documentType })).rejects.toMatchObject({ status: 403 });
    },
  );
  it.each(['CASH_CLOSE', 'REPORT_SNAPSHOT'] as const)(
    'denies Driver source filter %s',
    async (sourceType) => {
      await expect(documents.list(driver, { sourceType })).rejects.toMatchObject({ status: 403 });
    },
  );
  it('denies Driver TEST_PRINT history before querying the ledger', async () => {
    await expect(attempts.list(driver, { mode: 'TEST_PRINT' })).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each([0, -1, 101, 1.5, Number.NaN])(
    'rejects invalid history limit %s in both repositories',
    async (limit) => {
      await expect(documents.list(driver, { limit })).rejects.toMatchObject({ name: 'ZodError' });
      await expect(attempts.list(driver, { limit })).rejects.toMatchObject({ name: 'ZodError' });
    },
  );
  it('rejects incompatible source pairs', async () => {
    await expect(
      documents.loadSource(driver, {
        documentType: 'TICKET',
        sourceType: 'REPORT_SNAPSHOT',
        sourceId: driver.id,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('normalizes offsets while retaining microseconds and rejects empty/reversed time ranges', () => {
    expect(
      normalizeHistoryFilters({
        from: '2036-01-01T00:00:00.000001Z',
        to: '2035-12-31T17:00:00.000002-07:00',
      }),
    ).toEqual({ from: '2036-01-01T00:00:00.000001000Z', to: '2036-01-01T00:00:00.000002000Z' });
    for (const to of ['2036-01-01T00:00:00Z', '2035-12-31T23:59:59Z']) {
      expect(() => normalizeHistoryFilters({ from: '2036-01-01T00:00:00Z', to })).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
  });
});

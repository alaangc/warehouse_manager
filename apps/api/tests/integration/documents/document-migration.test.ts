import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { down, up } from '../../../../../database/migrations/008_document_output.js';
import {
  documentIntegrationHarness,
  type DocumentIntegrationHarness,
} from '../../support/document-integration-harness.js';

describe('T123 document migration recovery', () => {
  let h: DocumentIntegrationHarness;
  beforeAll(async () => {
    h = await documentIntegrationHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  it('reverses and reapplies the migration before document history exists', async () => {
    await h.database.transaction().execute(async (transaction) => {
      await down(transaction);
      const result = await sql<{ name: string | null }>`
        select to_regclass('document_output')::text as name
      `.execute(transaction);
      expect(result.rows[0]!.name).toBeNull();
      await up(transaction);
    });
    await expect(h.insertDocument(h.ticket)).resolves.toEqual(expect.any(String));
  });

  it('refuses rollback after history exists and preserves all records', async () => {
    const before = await h.outputState();
    await expect(h.database.transaction().execute(down)).rejects.toThrow(
      'Document history exists; use a roll-forward migration',
    );
    expect(await h.outputState()).toEqual(before);
  });
});

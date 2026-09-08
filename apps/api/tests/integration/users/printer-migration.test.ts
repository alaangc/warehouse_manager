import { sql } from 'kysely';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { administrationHarness } from '../../support/administration-harness.js';
import { down, up } from '../../../../../database/migrations/007_printer_settings.js';

let harness: Awaited<ReturnType<typeof administrationHarness>>;
beforeAll(async () => {
  harness = await administrationHarness();
});
afterAll(async () => {
  await harness?.close();
});
it('enforces printer references, preference uniqueness, test shape, and append-only history', async () => {
  const db = harness.database;
  const printer = await db
    .insertInto('printer_profile')
    .values({
      name: 'Test',
      model: 'BLE',
      service_uuid: 'ffe0',
      write_characteristic_uuid: 'ffe1',
      write_mode: 'WITH_RESPONSE',
      command_dialect: 'ESC_POS',
      encoding: 'CP850',
      paper_width_mm: 58,
      max_chunk_bytes: 20,
      inter_chunk_delay_ms: 10,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const user = await db
    .selectFrom('app_user')
    .select('id')
    .where('username', '=', 'admin')
    .executeTakeFirstOrThrow();
  await sql`insert into user_printer_preference (user_id, printer_profile_id) values (${user.id}::uuid, ${printer.id}::uuid)`.execute(
    db,
  );
  await expect(
    sql`insert into user_printer_preference (user_id, printer_profile_id) values (${user.id}::uuid, ${printer.id}::uuid)`.execute(
      db,
    ),
  ).rejects.toMatchObject({ code: '23505' });
  const base = {
    actor_id: user.id,
    printer_profile_id: printer.id,
    mode: 'TEST_PRINT' as const,
    state: 'SUCCEEDED' as const,
    document_output_id: null,
    document_type: null,
    error_code: null,
    attempt_number: 1,
    request_id: 'test',
  };
  const attempt = await db
    .insertInto('output_attempt')
    .values(base)
    .returning('id')
    .executeTakeFirstOrThrow();
  await expect(
    db
      .insertInto('output_attempt')
      .values({ ...base, attempt_number: 2, document_output_id: crypto.randomUUID() })
      .execute(),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    sql`insert into output_attempt (actor_id, mode, state, attempt_number, request_id) values (${user.id}::uuid, 'TEST_PRINT', 'STARTED', 2, 'bad')`.execute(
      db,
    ),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    db
      .updateTable('output_attempt')
      .set({ state: 'FAILED' })
      .where('id', '=', attempt.id)
      .execute(),
  ).rejects.toThrow('append-only');
  await expect(
    db.deleteFrom('output_attempt').where('id', '=', attempt.id).execute(),
  ).rejects.toThrow('append-only');
  await expect(
    db.deleteFrom('printer_profile').where('id', '=', printer.id).execute(),
  ).rejects.toMatchObject({ code: expect.stringMatching(/^(23503|23001)$/) });
});
it('can roll back and reapply the additive schema on a disposable database', async () => {
  // This destructive down check is restricted to this test's disposable container.
  await down(harness.database as never);
  await up(harness.database as never);
  expect(
    (
      await sql<{ name: string }>`select to_regclass('output_attempt')::text as name`.execute(
        harness.database,
      )
    ).rows[0]?.name,
  ).toBe('output_attempt');
  expect(await harness.database.selectFrom('app_user').select('id').execute()).not.toHaveLength(0);
});

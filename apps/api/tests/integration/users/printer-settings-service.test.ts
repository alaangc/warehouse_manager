import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { administrationHarness, testPrinterProfile } from '../../support/administration-harness.js';
import { PrinterSettingsService } from '../../../src/modules/printers/printer-settings-service.js';
let harness: Awaited<ReturnType<typeof administrationHarness>>;
let service: PrinterSettingsService;
let admin: string;
let driver: string;
const context = (actorId = admin) => ({ actorId, requestId: crypto.randomUUID() });
beforeAll(async () => {
  harness = await administrationHarness();
  service = new PrinterSettingsService(harness.database);
  admin = (await harness.login('admin')).id;
  driver = (await harness.login('driver')).id;
});
afterEach(async () => {
  if (harness)
    await sql`drop trigger if exists reject_printer_audit on audit_event; drop function if exists reject_printer_audit()`.execute(
      harness.database,
    );
});
afterAll(async () => {
  await harness?.close();
});
async function expectAtomicAudit(table: 'printer_profile' | 'user_printer_preference', id: string) {
  const key = table === 'printer_profile' ? 'id' : 'user_id';
  const result = await sql<{ present: boolean }>`select exists (
    select 1 from ${sql.table(table)} as source join audit_event as audit
      on audit.entity_id = ${id}::uuid and audit.xmin = source.xmin
    where ${sql.ref(`source.${key}`)} = ${id}::uuid
      and audit.action = 'PRINTER_SETTING_CHANGED'
  ) as present`.execute(harness.database);
  expect(result.rows[0]?.present).toBe(true);
}
it('isolates preferences, audits configuration, versions profiles, and retains archived history', async () => {
  const profile = await service.create(testPrinterProfile, context());
  await expectAtomicAudit('printer_profile', profile.id);
  const other = await service.create({ ...testPrinterProfile, name: 'Other' }, context());
  await service.setPreference(
    { printerProfileId: profile.id, deviceLabel: 'Driver', lastTestResult: 'SUCCEEDED' },
    context(driver),
  );
  await service.setPreference({ printerProfileId: other.id }, context());
  await expectAtomicAudit('user_printer_preference', driver);
  await service.setPreference({ printerProfileId: profile.id }, context());
  await expectAtomicAudit('user_printer_preference', admin);
  await service.setPreference({ printerProfileId: other.id }, context());
  const before = await service.getPreference(driver);
  expect(before).toMatchObject({
    printerProfileId: profile.id,
    deviceLabel: 'Driver',
    lastTestResult: 'SUCCEEDED',
    lastTestedAt: expect.any(String),
  });
  expect(await service.getPreference(admin)).toMatchObject({ printerProfileId: other.id });
  const attempts = await Promise.all(
    [0, 1].map(() =>
      service.recordTestPrint(
        { mode: 'TEST_PRINT', printerProfileId: profile.id, state: 'UNKNOWN' },
        context(driver),
      ),
    ),
  );
  expect(attempts.map((a) => a.attemptNumber).sort()).toEqual([1, 2]);
  expect(attempts[0]).toMatchObject({ actorId: driver, documentId: null, state: 'UNKNOWN' });
  await expect(
    service.update(
      profile.id,
      { ...testPrinterProfile, expectedVersion: profile.version, active: false },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'ARCHIVE_REASON_REQUIRED' });
  const archived = await service.update(
    profile.id,
    { ...testPrinterProfile, expectedVersion: profile.version, active: false, reason: 'Retired' },
    context(),
  );
  expect(archived.version).toBe(profile.version + 1);
  await expectAtomicAudit('printer_profile', profile.id);
  await expect(
    service.update(
      profile.id,
      { ...testPrinterProfile, expectedVersion: profile.version, active: true },
      context(),
    ),
  ).rejects.toMatchObject({ code: 'OPTIMISTIC_CONFLICT' });
  expect((await service.list()).some((p) => p.id === profile.id)).toBe(false);
  expect((await service.list(true)).some((p) => p.id === profile.id)).toBe(true);
  await expect(
    service.setPreference({ printerProfileId: profile.id }, context(driver)),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.recordTestPrint(
      { mode: 'TEST_PRINT', printerProfileId: profile.id, state: 'STARTED' },
      context(driver),
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(await service.getPreference(driver)).toEqual(before);
  expect(
    await harness.database
      .selectFrom('output_attempt')
      .selectAll()
      .where('printer_profile_id', '=', profile.id)
      .execute(),
  ).toHaveLength(2);
  const audits = await harness.database
    .selectFrom('audit_event')
    .selectAll()
    .where('entity_id', '=', profile.id)
    .orderBy('occurred_at')
    .execute();
  expect(audits).toHaveLength(2);
  expect(audits[1]).toMatchObject({
    action: 'PRINTER_SETTING_CHANGED',
    before_values: { active: true },
    after_values: { active: false },
  });
  const restored = await service.update(
    profile.id,
    {
      ...testPrinterProfile,
      name: 'Reapproved',
      expectedVersion: archived.version,
      active: true,
    },
    context(),
  );
  expect(restored).toMatchObject({
    name: 'Reapproved',
    active: true,
    version: archived.version + 1,
  });
  await expectAtomicAudit('printer_profile', profile.id);
});
it('rejects unsafe test payloads before storing any output', async () => {
  const profile = await service.create(testPrinterProfile, context());
  for (const input of [
    { mode: 'TEST_PRINT', state: 'SUCCEEDED' },
    {
      mode: 'TEST_PRINT',
      printerProfileId: profile.id,
      state: 'SUCCEEDED',
      documentId: crypto.randomUUID(),
    },
    { mode: 'PRINT', printerProfileId: profile.id, state: 'SUCCEEDED' },
  ])
    await expect(service.recordTestPrint(input, context())).rejects.toThrow();
  expect(
    await harness.database
      .selectFrom('output_attempt')
      .selectAll()
      .where('printer_profile_id', '=', profile.id)
      .execute(),
  ).toHaveLength(0);
});
it('rolls back profile creation, edits, archival and preference inserts/updates when auditing fails', async () => {
  const profile = await service.create(testPrinterProfile, context());
  await service.setPreference(
    { printerProfileId: profile.id, deviceLabel: 'Before failure' },
    context(driver),
  );
  const before = await service.getPreference(driver);
  const user = await harness.database
    .insertInto('app_user')
    .values({
      id: crypto.randomUUID(),
      username: crypto.randomUUID(),
      display_name: 'Fresh',
      password_hash: 'unused',
      role: 'DRIVER',
      active: true,
      archived_at: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await sql`create function reject_printer_audit() returns trigger language plpgsql as $$ begin raise exception 'printer audit failure'; end $$; create trigger reject_printer_audit before insert on audit_event for each row execute function reject_printer_audit()`.execute(
    harness.database,
  );
  await expect(
    service.create({ ...testPrinterProfile, name: 'Rejected' }, context()),
  ).rejects.toThrow('printer audit failure');
  for (const active of [true, false])
    await expect(
      service.update(
        profile.id,
        {
          ...testPrinterProfile,
          name: 'Rejected edit',
          expectedVersion: profile.version,
          active,
          reason: 'Retired',
        },
        context(),
      ),
    ).rejects.toThrow('printer audit failure');
  for (const actor of [driver, user.id])
    await expect(
      service.setPreference({ printerProfileId: profile.id }, context(actor)),
    ).rejects.toThrow('printer audit failure');
  expect(await service.get(profile.id)).toEqual(profile);
  expect(await service.getPreference(driver)).toEqual(before);
  expect(await service.getPreference(user.id)).toBeNull();
  expect((await service.list(true)).some((p) => p.name === 'Rejected')).toBe(false);
});

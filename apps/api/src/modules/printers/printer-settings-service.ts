import type { Selectable, Transaction } from 'kysely';
import { z } from 'zod';
import type { AppDatabase } from '../../db/database.js';
import type { Database, PrinterProfileTable, UserPrinterPreferenceTable } from '../../db/types.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { requireVersion, type AdministrationContext } from '../users/user-admin-service.js';

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(120),
    serviceUuid: z.string().min(1).max(64),
    writeCharacteristicUuid: z.string().min(1).max(64),
    writeMode: z.enum(['WITH_RESPONSE', 'WITHOUT_RESPONSE']),
    commandDialect: z.literal('ESC_POS'),
    paperWidthMm: z.union([z.literal(58), z.literal(80)]),
    encoding: z.enum(['CP850', 'CP437', 'UTF-8']),
    maxChunkBytes: z.number().int().min(1).max(1024),
    interChunkDelayMs: z.number().int().min(0).max(5000),
  })
  .strict();
const updateSchema = profileSchema.extend({
  expectedVersion: z.number().int().positive(),
  active: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
});
const preferenceSchema = z
  .object({
    printerProfileId: z.uuid(),
    deviceLabel: z.string().max(120).nullable().optional(),
    testedBrowser: z.string().max(120).nullable().optional(),
    testedOs: z.string().max(120).nullable().optional(),
    lastTestResult: z.enum(['SUCCEEDED', 'FAILED', 'UNKNOWN']).nullable().optional(),
  })
  .strict();
const testSchema = z
  .object({
    mode: z.literal('TEST_PRINT'),
    printerProfileId: z.uuid(),
    state: z.enum(['STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN']),
    errorCode: z.string().max(120).nullable().optional(),
    requestId: z.string().max(200).nullable().optional(),
  })
  .strict();
function profileResource(row: Selectable<PrinterProfileTable>) {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    transport: row.transport,
    serviceUuid: row.service_uuid,
    writeCharacteristicUuid: row.write_characteristic_uuid,
    writeMode: row.write_mode,
    commandDialect: row.command_dialect,
    paperWidthMm: row.paper_width_mm,
    encoding: row.encoding,
    maxChunkBytes: row.max_chunk_bytes,
    interChunkDelayMs: row.inter_chunk_delay_ms,
    active: row.active,
    version: row.version,
  };
}
function preferenceResource(row: Selectable<UserPrinterPreferenceTable>) {
  return {
    printerProfileId: row.printer_profile_id,
    deviceLabel: row.device_label,
    testedBrowser: row.tested_browser,
    testedOs: row.tested_os,
    lastTestResult: row.last_test_result,
    lastTestedAt: row.last_tested_at?.toISOString() ?? null,
  };
}
function profileValues(input: z.infer<typeof profileSchema>) {
  return {
    name: input.name,
    model: input.model,
    service_uuid: input.serviceUuid,
    write_characteristic_uuid: input.writeCharacteristicUuid,
    write_mode: input.writeMode,
    command_dialect: input.commandDialect,
    paper_width_mm: input.paperWidthMm,
    encoding: input.encoding,
    max_chunk_bytes: input.maxChunkBytes,
    inter_chunk_delay_ms: input.interChunkDelayMs,
  };
}
async function lockProfile(transaction: Transaction<Database>, id: string, requireActive = true) {
  const row = await transaction
    .selectFrom('printer_profile')
    .selectAll()
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw new HttpProblem(404, 'RESOURCE_NOT_FOUND', 'Not Found');
  if (requireActive && !row.active)
    throw new HttpProblem(409, 'PRINTER_PROFILE_INACTIVE', 'Conflict');
  return row;
}
// Trusted callers supply the authenticated actor. HTTP role policies belong to T113.
export class PrinterSettingsService {
  constructor(private readonly database: AppDatabase) {}
  async get(id: string) {
    const row = await this.database
      .selectFrom('printer_profile')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new HttpProblem(404, 'RESOURCE_NOT_FOUND', 'Not Found');
    return profileResource(row);
  }
  async list(includeArchived = false) {
    let query = this.database
      .selectFrom('printer_profile')
      .selectAll()
      .orderBy('name')
      .orderBy('id');
    if (!includeArchived) query = query.where('active', '=', true);
    return (await query.execute()).map(profileResource);
  }
  async create(raw: unknown, context: AdministrationContext) {
    const input = profileSchema.parse(raw);
    return runSerializable(this.database, async (transaction) => {
      const row = await transaction
        .insertInto('printer_profile')
        .values({
          ...profileValues(input),
          id: crypto.randomUUID(),
          active: true,
          archived_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const after = profileResource(row);
      await new AuditWriter().write(transaction, {
        ...context,
        entityType: 'PRINTER_PROFILE',
        entityId: row.id,
        action: 'PRINTER_SETTING_CHANGED',
        after,
      });
      return after;
    });
  }
  async update(id: string, raw: unknown, context: AdministrationContext) {
    const input = updateSchema.parse(raw);
    return runSerializable(this.database, async (transaction) => {
      const row = await lockProfile(transaction, id, false);
      requireVersion(row.version, input.expectedVersion);
      if (row.active && !input.active && !input.reason?.trim())
        throw new HttpProblem(422, 'ARCHIVE_REASON_REQUIRED', 'Validation Failed');
      const updated = await transaction
        .updateTable('printer_profile')
        .set({
          ...profileValues(input),
          active: input.active,
          archived_at: input.active ? null : (row.archived_at ?? new Date()),
          updated_at: new Date(),
          version: row.version + 1,
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      const after = profileResource(updated);
      await new AuditWriter().write(transaction, {
        ...context,
        entityType: 'PRINTER_PROFILE',
        entityId: id,
        action: 'PRINTER_SETTING_CHANGED',
        before: profileResource(row),
        after,
        ...(input.reason ? { reason: input.reason } : {}),
      });
      return after;
    });
  }
  async getPreference(actorId: string) {
    const row = await this.database
      .selectFrom('user_printer_preference')
      .selectAll()
      .where('user_id', '=', actorId)
      .executeTakeFirst();
    return row ? preferenceResource(row) : null;
  }
  async setPreference(raw: unknown, context: AdministrationContext) {
    const input = preferenceSchema.parse(raw);
    return runSerializable(this.database, async (transaction) => {
      await lockProfile(transaction, input.printerProfileId);
      // Lock the actor even when their preference does not exist yet.
      await transaction
        .selectFrom('app_user')
        .select('id')
        .where('id', '=', context.actorId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const before = await transaction
        .selectFrom('user_printer_preference')
        .selectAll()
        .where('user_id', '=', context.actorId)
        .executeTakeFirst();
      const now = new Date();
      const values = {
        printer_profile_id: input.printerProfileId,
        device_label: input.deviceLabel ?? null,
        tested_browser: input.testedBrowser ?? null,
        tested_os: input.testedOs ?? null,
        last_test_result: input.lastTestResult ?? null,
        last_tested_at: input.lastTestResult ? now : null,
        updated_at: now,
      };
      const row = await transaction
        .insertInto('user_printer_preference')
        .values({ ...values, user_id: context.actorId, created_at: now })
        .onConflict((oc) => oc.column('user_id').doUpdateSet(values))
        .returningAll()
        .executeTakeFirstOrThrow();
      const after = preferenceResource(row);
      await new AuditWriter().write(transaction, {
        ...context,
        entityType: 'USER_PRINTER_PREFERENCE',
        entityId: context.actorId,
        action: 'PRINTER_SETTING_CHANGED',
        ...(before ? { before: preferenceResource(before) } : {}),
        after,
      });
      return after;
    });
  }
  async recordTestPrint(raw: unknown, context: AdministrationContext) {
    const input = testSchema.parse(raw);
    return runSerializable(this.database, async (transaction) => {
      await lockProfile(transaction, input.printerProfileId);
      // The serializable predicate read and unique key protect concurrent numbering.
      const last = await transaction
        .selectFrom('output_attempt')
        .select('attempt_number')
        .where('actor_id', '=', context.actorId)
        .where('printer_profile_id', '=', input.printerProfileId)
        .orderBy('attempt_number', 'desc')
        .executeTakeFirst();
      const row = await transaction
        .insertInto('output_attempt')
        .values({
          document_output_id: null,
          document_type: null,
          actor_id: context.actorId,
          mode: 'TEST_PRINT',
          printer_profile_id: input.printerProfileId,
          state: input.state,
          error_code: input.errorCode ?? null,
          attempt_number: (last?.attempt_number ?? 0) + 1,
          request_id: context.requestId,
          created_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        id: row.id,
        actorId: row.actor_id,
        documentId: null,
        mode: row.mode,
        printerProfileId: row.printer_profile_id,
        state: row.state,
        errorCode: row.error_code,
        requestId: row.request_id,
        attemptNumber: row.attempt_number,
        createdAt: row.created_at.toISOString(),
      };
    });
  }
}

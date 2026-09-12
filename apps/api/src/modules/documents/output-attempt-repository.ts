import { sql, type Selectable } from 'kysely';
import { z } from 'zod';
import type { AppDatabase } from '../../db/database.js';
import type { OutputAttemptTable } from '../../db/types.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { ScopedCursor, type HistoryPrincipal } from '../../shared/pagination/scoped-cursor.js';
import {
  DocumentRepository,
  documentForbidden,
  documentScope,
  historyConditions,
  historyFilterSchema,
  historyPage,
  normalizeHistoryFilters,
} from './document-repository.js';

const modeSchema = z.enum(['GENERATE', 'DOWNLOAD', 'SHARE', 'PRINT', 'REPRINT', 'TEST_PRINT']);
const stateSchema = z.enum(['STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN']);
const filterSchema = historyFilterSchema
  .extend({
    documentId: z.uuid().optional(),
    mode: modeSchema.optional(),
    state: stateSchema.optional(),
  })
  .strict();
export type OutputAttemptFilters = z.input<typeof filterSchema>;
export type OutputAttemptRow = Selectable<OutputAttemptTable>;
const appendSchema = z
  .object({
    documentId: z.uuid().optional(),
    mode: modeSchema,
    state: stateSchema,
    printerProfileId: z.uuid().optional(),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,99}$/)
      .optional(),
    attemptNumber: z.number().int().positive(),
    requestId: z.string().min(1).max(200),
  })
  .strict();
export type AppendOutputAttempt = z.input<typeof appendSchema>;

export class OutputAttemptRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly cursors: ScopedCursor,
  ) {}

  async list(principal: HistoryPrincipal, input: OutputAttemptFilters = {}) {
    const filters = normalizeHistoryFilters(filterSchema.parse(input));
    if (filters.documentId) filters.documentId = filters.documentId.toLowerCase();
    const { limit, cursor, ...boundFilters } = filters;
    const scope = { principal, resource: 'output-attempts', filters: boundFilters };
    const conditions = [
      documentScope(principal),
      ...historyConditions('a', { ...boundFilters, cursor }, this.cursors, scope),
    ];
    if (principal.role === 'DRIVER' && filters.mode === 'TEST_PRINT') documentForbidden();
    if (filters.documentId) {
      await new DocumentRepository(this.database, this.cursors).detail(
        filters.documentId,
        principal,
      );
      conditions.push(sql<boolean>`a.document_output_id = ${filters.documentId}::uuid`);
    }
    if (filters.mode) conditions.push(sql<boolean>`a.mode = ${filters.mode}`);
    if (filters.state) conditions.push(sql<boolean>`a.state = ${filters.state}`);
    const rows = (
      await sql<OutputAttemptRow & { cursor_created_at: string }>`select a.*,
      to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at
      from output_attempt a left join document_output d on d.id = a.document_output_id
      where ${sql.join(conditions, sql` and `)} order by a.created_at desc, a.id desc
      limit ${limit + 1}`.execute(this.database)
    ).rows;
    return historyPage(rows, limit, this.cursors, scope);
  }

  async detail(id: string, principal: HistoryPrincipal): Promise<OutputAttemptRow> {
    const row = (
      await sql<OutputAttemptRow>`select a.* from output_attempt a
      left join document_output d on d.id = a.document_output_id
      where a.id = ${id}::uuid and ${documentScope(principal)}`.execute(this.database)
    ).rows[0];
    if (row) return row;
    const exists = await this.database
      .selectFrom('output_attempt')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (exists) documentForbidden();
    throw new HttpProblem(404, 'OUTPUT_ATTEMPT_NOT_FOUND', 'Output attempt not found');
  }

  async append(principal: HistoryPrincipal, input: AppendOutputAttempt): Promise<OutputAttemptRow> {
    const data = appendSchema.parse(input);
    const document = data.documentId
      ? await new DocumentRepository(this.database, this.cursors).detail(data.documentId, principal)
      : null;
    // Source authorization deliberately precedes thermal capability checks.
    if (data.mode === 'TEST_PRINT' ? document !== null : document === null) {
      throw new HttpProblem(422, 'INVALID_OUTPUT_REFERENCE', 'Invalid output document reference');
    }
    if (['PRINT', 'REPRINT', 'TEST_PRINT'].includes(data.mode) && !data.printerProfileId) {
      throw new HttpProblem(422, 'PRINTER_REQUIRED', 'A printer profile is required');
    }
    if (['PRINT', 'REPRINT'].includes(data.mode) && document?.document_type === 'REPORT') {
      throw new HttpProblem(
        422,
        'DOCUMENT_NOT_PRINTABLE',
        'Reports do not support thermal printing',
      );
    }
    if (data.printerProfileId) {
      const printer = await this.database
        .selectFrom('printer_profile')
        .select('id')
        .where('id', '=', data.printerProfileId)
        .where('active', '=', true)
        .where('archived_at', 'is', null)
        .executeTakeFirst();
      if (!printer)
        throw new HttpProblem(422, 'PRINTER_UNAVAILABLE', 'Printer profile is unavailable');
    }
    return this.database
      .insertInto('output_attempt')
      .values({
        document_output_id: document?.id ?? null,
        document_type: document?.document_type ?? null,
        actor_id: principal.id,
        mode: data.mode,
        printer_profile_id: data.printerProfileId ?? null,
        state: data.state,
        error_code: data.errorCode ?? null,
        attempt_number: data.attemptNumber,
        request_id: data.requestId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}

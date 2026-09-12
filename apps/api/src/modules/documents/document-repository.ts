import { sql, type RawBuilder, type Selectable } from 'kysely';
import { z } from 'zod';
import type { AppDatabase } from '../../db/database.js';
import type {
  DocumentOutputTable,
  DocumentSourceType,
  DocumentType,
  JsonValue,
} from '../../db/types.js';
import { HttpProblem } from '../../http/problem-handler.js';
import {
  normalizeHistoryTime,
  ScopedCursor,
  type CursorScope,
  type HistoryPrincipal,
} from '../../shared/pagination/scoped-cursor.js';

export const sourcePairs = {
  TICKET: 'SALE',
  ROUTE_LOAD: 'ROUTE_LOAD',
  CASH_CLOSE: 'CASH_CLOSE',
  REPORT: 'REPORT_SNAPSHOT',
} as const;
export type DocumentSource = {
  documentType: DocumentType;
  sourceType: DocumentSourceType;
  sourceId: string;
};
export type DocumentRow = Selectable<DocumentOutputTable>;
export type LoadedDocumentSource = DocumentSource & {
  contentVersion: string;
  createdAt: string;
  snapshot: JsonValue;
};

export function documentForbidden(): never {
  throw new HttpProblem(
    403,
    'DOCUMENT_FORBIDDEN',
    'Document source is outside the authenticated scope',
  );
}

/** The same predicate protects document metadata, storage lookup and attempt history. */
export function documentScope(principal: HistoryPrincipal, alias = 'd'): RawBuilder<boolean> {
  if (principal.role === 'ADMINISTRATOR') return sql<boolean>`true`;
  const type = sql.ref(`${alias}.document_type`);
  const source = sql.ref(`${alias}.source_id`);
  return sql<boolean>`(
    (${type} = 'TICKET' and exists (
      select 1 from sale s where s.id = ${source} and s.driver_id = ${principal.id}
    )) or (${type} = 'ROUTE_LOAD' and exists (
      select 1 from route_load l join route r on r.id = l.route_id
      where l.id = ${source} and l.state = 'CONFIRMED' and r.driver_id = ${principal.id}
    ))
  )`;
}

export const historyFilterSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(4096).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
const documentFilterSchema = historyFilterSchema
  .extend({
    documentType: z.enum(['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT']).optional(),
    state: z.enum(['PENDING', 'READY', 'FAILED']).optional(),
    sourceType: z.enum(['SALE', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT_SNAPSHOT']).optional(),
    sourceId: z.uuid().optional(),
  })
  .strict();
export type DocumentFilters = z.input<typeof documentFilterSchema>;

export function normalizeHistoryFilters<
  T extends { from?: string | undefined; to?: string | undefined },
>(filters: T): T {
  const normalized = { ...filters };
  if (normalized.from) normalized.from = normalizeHistoryTime(normalized.from);
  if (normalized.to) normalized.to = normalizeHistoryTime(normalized.to);
  if (normalized.from && normalized.to && normalized.from >= normalized.to) {
    throw new HttpProblem(422, 'INVALID_HISTORY_RANGE', 'History start must precede end');
  }
  return normalized;
}

export function historyConditions(
  alias: string,
  filters: { from?: string | undefined; to?: string | undefined; cursor?: string | undefined },
  cursors: ScopedCursor,
  scope: CursorScope,
): RawBuilder<boolean>[] {
  const created = sql.ref(`${alias}.created_at`);
  const conditions: RawBuilder<boolean>[] = [];
  if (filters.from) conditions.push(sql<boolean>`${created} >= ${filters.from}::timestamptz`);
  if (filters.to) conditions.push(sql<boolean>`${created} < ${filters.to}::timestamptz`);
  if (filters.cursor !== undefined) {
    const position = cursors.decode(filters.cursor, scope);
    conditions.push(
      sql<boolean>`(${created}, ${sql.ref(`${alias}.id`)}) < (${position.createdAt}::timestamptz, ${position.id}::uuid)`,
    );
  }
  return conditions;
}

export function historyPage<T extends { id: string; cursor_created_at: string }>(
  rows: T[],
  limit: number,
  cursors: ScopedCursor,
  scope: CursorScope,
) {
  const hasNextPage = rows.length > limit;
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    data: visible.map(({ cursor_created_at, ...row }) => {
      void cursor_created_at;
      return row;
    }),
    page: {
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? cursors.encode({ id: last.id, createdAt: last.cursor_created_at }, scope)
          : null,
    },
  };
}

async function inTransaction<T>(
  database: AppDatabase,
  action: (db: AppDatabase) => Promise<T>,
): Promise<T> {
  return database.isTransaction ? action(database) : database.transaction().execute(action);
}

export class DocumentRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly cursors: ScopedCursor,
  ) {}

  /** Authorize and load persisted snapshots only; never reconstruct historical catalog/prices. */
  async loadSource(
    principal: HistoryPrincipal,
    source: DocumentSource,
  ): Promise<LoadedDocumentSource> {
    if (sourcePairs[source.documentType] !== source.sourceType) {
      throw new HttpProblem(422, 'INVALID_DOCUMENT_SOURCE', 'Invalid document/source pair');
    }
    if (principal.role === 'DRIVER' && !['TICKET', 'ROUTE_LOAD'].includes(source.documentType))
      documentForbidden();
    return inTransaction(this.database, async (db) => {
      if (source.documentType === 'TICKET') {
        const sale = await db
          .selectFrom('sale')
          .select(['id', 'driver_id'])
          .where('id', '=', source.sourceId)
          .executeTakeFirst();
        if (!sale)
          throw new HttpProblem(404, 'DOCUMENT_SOURCE_NOT_FOUND', 'Document source not found');
        if (principal.role === 'DRIVER' && sale.driver_id !== principal.id) documentForbidden();
        const ticket = await db
          .selectFrom('sale_ticket')
          .selectAll()
          .where('sale_id', '=', sale.id)
          .executeTakeFirstOrThrow();
        return {
          ...source,
          contentVersion: ticket.content_version,
          createdAt: ticket.created_at.toISOString(),
          snapshot: ticket.printable_snapshot,
        };
      }
      if (source.documentType === 'ROUTE_LOAD') {
        const load = await db
          .selectFrom('route_load as l')
          .innerJoin('route as r', 'r.id', 'l.route_id')
          .selectAll('l')
          .select(['r.driver_id', 'r.route_number'])
          .where('l.id', '=', source.sourceId)
          .forUpdate('l')
          .executeTakeFirst();
        if (!load)
          throw new HttpProblem(404, 'DOCUMENT_SOURCE_NOT_FOUND', 'Document source not found');
        if (principal.role === 'DRIVER' && load.driver_id !== principal.id) documentForbidden();
        if (load.state !== 'CONFIRMED')
          throw new HttpProblem(409, 'ROUTE_LOAD_NOT_CONFIRMED', 'Route load must be confirmed');
        const lines = await db
          .selectFrom('route_load_line')
          .selectAll()
          .where('route_load_id', '=', load.id)
          .orderBy('id')
          .execute();
        return {
          ...source,
          contentVersion: '1',
          createdAt: load.confirmed_at!.toISOString(),
          snapshot: {
            loadNumber: load.id,
            routeNumber: load.route_number,
            lines: lines.map((line) => ({
              productName: line.product_name,
              unitCode: line.unit_code,
              quantity: line.quantity,
              quantityScale: line.quantity_scale,
            })),
          },
        };
      }
      if (source.documentType === 'CASH_CLOSE') {
        const close = await db
          .selectFrom('cash_close')
          .selectAll()
          .where('id', '=', source.sourceId)
          .executeTakeFirst();
        if (!close)
          throw new HttpProblem(404, 'DOCUMENT_SOURCE_NOT_FOUND', 'Document source not found');
        const lines = await db
          .selectFrom('cash_close_line')
          .selectAll()
          .where('cash_close_id', '=', close.id)
          .orderBy('reporting_group')
          .execute();
        return {
          ...source,
          contentVersion: '1',
          createdAt: close.created_at.toISOString(),
          snapshot: {
            closeNumber: close.close_number,
            currencyCode: close.currency_code,
            businessTimezone: close.business_timezone,
            periodKind: close.period_kind,
            periodStart: close.period_start.toISOString(),
            periodEnd: close.period_end.toISOString(),
            grossTotal: close.gross_total,
            partnerRate: close.partner_rate,
            partnerShare: close.partner_amount,
            ownerShare: close.remaining_amount,
            roundingMode: close.rounding_mode,
            supersedesCashCloseId: close.supersedes_cash_close_id,
            correctionReason: close.correction_reason,
            lines: lines.map((line) => ({
              reportingGroup: line.reporting_group,
              total: line.total,
            })),
          },
        };
      }
      const report = await db
        .selectFrom('report_snapshot')
        .selectAll()
        .where('id', '=', source.sourceId)
        .executeTakeFirst();
      if (!report)
        throw new HttpProblem(404, 'DOCUMENT_SOURCE_NOT_FOUND', 'Document source not found');
      return {
        ...source,
        contentVersion: '1',
        createdAt: report.created_at.toISOString(),
        snapshot: {
          reportType: report.report_type,
          filters: report.filters,
          businessTimezone: report.business_timezone,
          sourceWatermark: report.source_watermark,
          result: report.result,
        },
      };
    });
  }

  async detail(id: string, principal: HistoryPrincipal): Promise<DocumentRow> {
    const row = (
      await sql<DocumentRow>`select d.* from document_output d
      where d.id = ${id}::uuid and ${documentScope(principal)}`.execute(this.database)
    ).rows[0];
    if (row) return row;
    const exists = await this.database
      .selectFrom('document_output')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (exists) documentForbidden();
    throw new HttpProblem(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
  }

  async list(principal: HistoryPrincipal, input: DocumentFilters = {}) {
    const filters = normalizeHistoryFilters(documentFilterSchema.parse(input));
    if (filters.sourceId) filters.sourceId = filters.sourceId.toLowerCase();
    const { limit, cursor, ...boundFilters } = filters;
    const scope = { principal, resource: 'documents', filters: boundFilters };
    const conditions = [
      documentScope(principal),
      ...historyConditions('d', { ...boundFilters, cursor }, this.cursors, scope),
    ];
    if (principal.role === 'DRIVER') {
      if (
        (filters.documentType && !['TICKET', 'ROUTE_LOAD'].includes(filters.documentType)) ||
        (filters.sourceType && !['SALE', 'ROUTE_LOAD'].includes(filters.sourceType))
      )
        documentForbidden();
      if (filters.sourceId) {
        const type =
          filters.documentType ??
          (filters.sourceType === 'SALE'
            ? 'TICKET'
            : filters.sourceType === 'ROUTE_LOAD'
              ? 'ROUTE_LOAD'
              : undefined);
        if (type)
          await this.loadSource(principal, {
            documentType: type,
            sourceType: sourcePairs[type],
            sourceId: filters.sourceId,
          });
        else {
          // A bare ID still cannot be used to probe an unrelated source.
          const owned = (
            await sql<{ allowed: boolean }>`select (
            exists(select 1 from sale where id = ${filters.sourceId}::uuid and driver_id = ${principal.id}) or
            exists(select 1 from route_load l join route r on r.id = l.route_id where l.id = ${filters.sourceId}::uuid and l.state = 'CONFIRMED' and r.driver_id = ${principal.id})
          ) as allowed`.execute(this.database)
          ).rows[0];
          if (!owned?.allowed) documentForbidden();
        }
      }
    }
    if (filters.documentType)
      conditions.push(sql<boolean>`d.document_type = ${filters.documentType}`);
    if (filters.sourceType) conditions.push(sql<boolean>`d.source_type = ${filters.sourceType}`);
    if (filters.sourceId) conditions.push(sql<boolean>`d.source_id = ${filters.sourceId}::uuid`);
    if (filters.state) conditions.push(sql<boolean>`d.state = ${filters.state}`);
    const rows = (
      await sql<DocumentRow & { cursor_created_at: string }>`select d.*,
      to_char(d.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created_at
      from document_output d where ${sql.join(conditions, sql` and `)}
      order by d.created_at desc, d.id desc limit ${limit + 1}`.execute(this.database)
    ).rows;
    return historyPage(rows, limit, this.cursors, scope);
  }

  async createOrReuse(
    principal: HistoryPrincipal,
    source: DocumentSource,
    contentVersion: string,
    contentHash: string,
  ) {
    return inTransaction(this.database, async (db) => {
      const repository = new DocumentRepository(db, this.cursors);
      await repository.loadSource(principal, source);
      const created = await db
        .insertInto('document_output')
        .values({
          document_type: source.documentType,
          source_type: source.sourceType,
          source_id: source.sourceId,
          content_version: contentVersion,
          content_hash: contentHash,
          state: 'PENDING',
          created_by: principal.id,
          storage_key: null,
          ready_at: null,
          last_error_code: null,
        })
        .onConflict((conflict) =>
          conflict
            .columns(['document_type', 'source_type', 'source_id', 'content_version'])
            .doNothing(),
        )
        .returningAll()
        .executeTakeFirst();
      if (created) return created;
      return db
        .selectFrom('document_output')
        .selectAll()
        .where('document_type', '=', source.documentType)
        .where('source_type', '=', source.sourceType)
        .where('source_id', '=', source.sourceId)
        .where('content_version', '=', contentVersion)
        .executeTakeFirstOrThrow();
    });
  }
}

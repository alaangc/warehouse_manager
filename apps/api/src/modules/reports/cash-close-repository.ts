import { sql, type Kysely, type Selectable } from 'kysely';
import type {
  CashCloseTable,
  Database,
  ReportingGroup,
  ReportingPeriodKind,
} from '../../db/types.js';

export interface CashClosePeriodKey {
  businessTimezone: string;
  periodStart: Date | string;
  periodEnd: Date | string;
}

export interface CashCloseInsert extends CashClosePeriodKey {
  id?: string;
  closeNumber: string;
  periodKind: ReportingPeriodKind;
  anchorDate: string;
  currencyCode: string;
  grossTotal: string;
  partnerRate: string;
  partnerAmount: string;
  remainingAmount: string;
  roundingMode: 'HALF_AWAY_FROM_ZERO';
  createdBy: string;
  idempotencyRequestId: string;
  supersedesCashCloseId: string | null;
  correctionReason: string | null;
}

export interface CashCloseLineInsert {
  reportingGroup: ReportingGroup;
  total: string;
}

export interface CashCloseSaleInsert {
  saleId: string;
  includedAmount: string;
}

export interface CashCloseCursor {
  createdAt: Date | string;
  id: string;
}

export interface CashCloseListFilters {
  period?: CashClosePeriodKey;
  status?: 'CURRENT' | 'SUPERSEDED';
  cursor?: CashCloseCursor;
  limit?: number;
}

export interface CashCloseProjection extends Selectable<CashCloseTable> {
  status: 'CURRENT' | 'SUPERSEDED';
  superseded_by_cash_close_id: string | null;
  lines: Array<{ reporting_group: ReportingGroup; total: string }>;
  sales: Array<{ sale_id: string; included_amount: string }>;
}

export interface CashClosePage {
  items: CashCloseProjection[];
  hasNextPage: boolean;
  nextCursor: CashCloseCursor | null;
}

export class CashCloseRepository {
  constructor(private readonly database: Kysely<Database>) {}

  insertClose(input: CashCloseInsert) {
    return this.database
      .insertInto('cash_close')
      .values({
        ...(input.id ? { id: input.id } : {}),
        close_number: input.closeNumber,
        period_kind: input.periodKind,
        anchor_date: input.anchorDate,
        business_timezone: input.businessTimezone,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        currency_code: input.currencyCode,
        gross_total: input.grossTotal,
        partner_rate: input.partnerRate,
        partner_amount: input.partnerAmount,
        remaining_amount: input.remainingAmount,
        rounding_mode: input.roundingMode,
        created_by: input.createdBy,
        idempotency_request_id: input.idempotencyRequestId,
        supersedes_cash_close_id: input.supersedesCashCloseId,
        correction_reason: input.correctionReason,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async insertLines(cashCloseId: string, lines: readonly CashCloseLineInsert[]): Promise<void> {
    if (lines.length === 0) return;
    await this.database
      .insertInto('cash_close_line')
      .values(
        lines.map((line) => ({
          cash_close_id: cashCloseId,
          reporting_group: line.reportingGroup,
          total: line.total,
        })),
      )
      .execute();
  }

  async insertSales(cashCloseId: string, sales: readonly CashCloseSaleInsert[]): Promise<void> {
    if (sales.length === 0) return;
    await this.database
      .insertInto('cash_close_sale')
      .values(
        sales.map((sale) => ({
          cash_close_id: cashCloseId,
          sale_id: sale.saleId,
          included_amount: sale.includedAmount,
        })),
      )
      .execute();
  }

  async tryInsertCurrentPeriod(period: CashClosePeriodKey, cashCloseId: string): Promise<boolean> {
    const inserted = await this.database
      .insertInto('cash_close_current_period')
      .values({
        business_timezone: period.businessTimezone,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        current_cash_close_id: cashCloseId,
      })
      .onConflict((conflict) =>
        conflict.columns(['business_timezone', 'period_start', 'period_end']).doNothing(),
      )
      .returning('current_cash_close_id')
      .executeTakeFirst();
    return inserted !== undefined;
  }

  lockCurrentPeriod(period: CashClosePeriodKey) {
    return this.database
      .selectFrom('cash_close_current_period')
      .selectAll()
      .where('business_timezone', '=', period.businessTimezone)
      .where('period_start', '=', new Date(period.periodStart))
      .where('period_end', '=', new Date(period.periodEnd))
      .forUpdate()
      .executeTakeFirst();
  }

  async compareAndSwapCurrent(
    period: CashClosePeriodKey,
    expectedCashCloseId: string,
    successorCashCloseId: string,
  ): Promise<boolean> {
    const updated = await this.database
      .updateTable('cash_close_current_period')
      .set({ current_cash_close_id: successorCashCloseId })
      .where('business_timezone', '=', period.businessTimezone)
      .where('period_start', '=', new Date(period.periodStart))
      .where('period_end', '=', new Date(period.periodEnd))
      .where('current_cash_close_id', '=', expectedCashCloseId)
      .returning('current_cash_close_id')
      .executeTakeFirst();
    return updated !== undefined;
  }

  lockVersion(cashCloseId: string) {
    return this.database
      .selectFrom('cash_close')
      .selectAll()
      .where('id', '=', cashCloseId)
      .forUpdate()
      .executeTakeFirst();
  }

  async detail(cashCloseId: string): Promise<CashCloseProjection | null> {
    const row = await this.projectionQuery()
      .where('cash_close.id', '=', cashCloseId)
      .executeTakeFirst();
    if (!row) return null;
    return (await this.hydrate([row]))[0]!;
  }

  async list(filters: CashCloseListFilters = {}): Promise<CashClosePage> {
    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
    let query = this.projectionQuery();
    if (filters.period)
      query = query
        .where('cash_close.business_timezone', '=', filters.period.businessTimezone)
        .where('cash_close.period_start', '=', new Date(filters.period.periodStart))
        .where('cash_close.period_end', '=', new Date(filters.period.periodEnd));
    if (filters.status === 'CURRENT') {
      query = query.whereRef(
        'cash_close_current_period.current_cash_close_id',
        '=',
        'cash_close.id',
      );
    } else if (filters.status === 'SUPERSEDED') {
      query = query.whereRef(
        'cash_close_current_period.current_cash_close_id',
        '!=',
        'cash_close.id',
      );
    }
    if (filters.cursor) {
      query = query.where((expression) =>
        expression.or([
          expression(
            'cash_close.created_at',
            '<',
            sql<Date>`${filters.cursor!.createdAt}::timestamptz`,
          ),
          expression.and([
            expression(
              'cash_close.created_at',
              '=',
              sql<Date>`${filters.cursor!.createdAt}::timestamptz`,
            ),
            expression('cash_close.id', '<', filters.cursor!.id),
          ]),
        ]),
      );
    }
    const rows = await query
      .orderBy('cash_close.created_at', 'desc')
      .orderBy('cash_close.id', 'desc')
      .limit(limit + 1)
      .execute();
    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
    const items = await this.hydrate(pageRows);
    const last = pageRows.at(-1);
    return {
      items,
      hasNextPage,
      nextCursor: hasNextPage && last ? { createdAt: last.cursor_created_at, id: last.id } : null,
    };
  }

  private projectionQuery() {
    return this.database
      .selectFrom('cash_close')
      .leftJoin('cash_close_current_period', (join) =>
        join
          .onRef('cash_close_current_period.business_timezone', '=', 'cash_close.business_timezone')
          .onRef('cash_close_current_period.period_start', '=', 'cash_close.period_start')
          .onRef('cash_close_current_period.period_end', '=', 'cash_close.period_end'),
      )
      .leftJoin('cash_close as successor', 'successor.supersedes_cash_close_id', 'cash_close.id')
      .selectAll('cash_close')
      .select([
        sql<string>`cash_close.anchor_date::text`.as('anchor_date'),
        sql<string>`cash_close.created_at::text`.as('cursor_created_at'),
        'successor.id as superseded_by_cash_close_id',
        sql<'CURRENT' | 'SUPERSEDED'>`
          case
            when cash_close_current_period.current_cash_close_id = cash_close.id then 'CURRENT'
            else 'SUPERSEDED'
          end
        `.as('status'),
      ]);
  }

  private async hydrate<
    T extends Selectable<CashCloseTable> & {
      status: 'CURRENT' | 'SUPERSEDED';
      superseded_by_cash_close_id: string | null;
    },
  >(rows: T[]): Promise<CashCloseProjection[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [lines, sales] = await Promise.all([
      this.database
        .selectFrom('cash_close_line')
        .select(['cash_close_id', 'reporting_group', 'total'])
        .where('cash_close_id', 'in', ids)
        .orderBy(
          sql<number>`array_position(array['SODAS','CHARCOAL','TOSTADAS','OTHER']::text[], reporting_group)`,
        )
        .execute(),
      this.database
        .selectFrom('cash_close_sale')
        .select(['cash_close_id', 'sale_id', 'included_amount'])
        .where('cash_close_id', 'in', ids)
        .orderBy('sale_id')
        .execute(),
    ]);
    return rows.map((row) => ({
      ...row,
      lines: lines
        .filter((line) => line.cash_close_id === row.id)
        .map(({ reporting_group, total }) => ({ reporting_group, total })),
      sales: sales
        .filter((sale) => sale.cash_close_id === row.id)
        .map(({ sale_id, included_amount }) => ({ sale_id, included_amount })),
    }));
  }
}

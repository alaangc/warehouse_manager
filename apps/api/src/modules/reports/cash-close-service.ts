import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import { Temporal } from '@js-temporal/polyfill';
import type { AppDatabase } from '../../db/database.js';
import type { Database } from '../../db/types.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { calculatePartnerShare, sumMoney } from '../../shared/money.js';
import { CashCloseRepository, type CashCloseProjection } from './cash-close-repository.js';
import { REPORTING_GROUPS } from './financial-calculations.js';
import { ReportRepository } from './report-repository.js';
import { ReportingError, runReportCommand, type ReportCommandContext } from './report-command.js';
import {
  resolveReportingPeriod,
  type ReportingPeriodKind,
  type ResolvedReportingPeriod,
} from './reporting-period.js';

export function reportingInstant(value: Date | string): string {
  return Temporal.Instant.from(value instanceof Date ? value.toISOString() : value).toString();
}

export function cashCloseResource(row: CashCloseProjection) {
  return {
    id: row.id,
    closeNumber: row.close_number,
    periodKind: row.period_kind,
    anchorDate: row.anchor_date,
    periodStart: reportingInstant(row.period_start),
    periodEnd: reportingInstant(row.period_end),
    businessTimezone: row.business_timezone,
    status: row.status,
    supersedesCashCloseId: row.supersedes_cash_close_id,
    supersededByCashCloseId: row.superseded_by_cash_close_id,
    correctionReason: row.correction_reason,
    currencyCode: row.currency_code,
    grossTotal: row.gross_total,
    partnerRate: row.partner_rate,
    partnerAmount: row.partner_amount,
    remainingAmount: row.remaining_amount,
    roundingMode: row.rounding_mode,
    lines: row.lines.map((line) => ({ reportingGroup: line.reporting_group, total: line.total })),
    contributingSaleIds: row.sales.map((sale) => sale.sale_id),
    createdBy: row.created_by,
    createdAt: reportingInstant(row.created_at),
  };
}

export class CashCloseService {
  constructor(private readonly database: AppDatabase) {}

  create(
    input: { periodKind: ReportingPeriodKind; anchorDate: string },
    context: ReportCommandContext,
  ) {
    return runSerializable(this.database, (transaction) =>
      runReportCommand(
        transaction,
        'CASH_CLOSE_CREATE',
        'CASH_CLOSE',
        { ...input },
        context,
        async (idempotencyRequestId) => {
          const settings = await transaction
            .selectFrom('business_setting')
            .selectAll()
            .executeTakeFirstOrThrow();
          const period = resolveReportingPeriod({
            ...input,
            businessTimezone: settings.business_timezone,
          });
          const repository = new CashCloseRepository(transaction);
          if (await repository.lockCurrentPeriod(period))
            throw new ReportingError(
              'CASH_CLOSE_PERIOD_ALREADY_CURRENT',
              'A current cash close already exists for this period.',
            );
          return this.persist(
            transaction,
            period,
            settings.currency_code,
            context,
            idempotencyRequestId,
            null,
            null,
          );
        },
      ),
    );
  }

  correct(cashCloseId: string, reason: string, context: ReportCommandContext) {
    if (!reason.trim() || reason.trim().length > 500)
      throw new ReportingError(
        'CORRECTION_REASON_REQUIRED',
        'A correction reason of 1–500 characters is required.',
      );
    return runSerializable(this.database, (transaction) =>
      runReportCommand(
        transaction,
        'CASH_CLOSE_CORRECT',
        'CASH_CLOSE',
        { cashCloseId, reason },
        context,
        async (idempotencyRequestId) => {
          const repository = new CashCloseRepository(transaction);
          const predecessor = await repository.detail(cashCloseId);
          if (!predecessor)
            throw new ReportingError('CASH_CLOSE_NOT_FOUND', 'Cash close not found.');
          const period: ResolvedReportingPeriod = {
            periodKind: predecessor.period_kind,
            anchorDate: predecessor.anchor_date,
            businessTimezone: predecessor.business_timezone,
            periodStart: reportingInstant(predecessor.period_start),
            periodEnd: reportingInstant(predecessor.period_end),
          };
          const pointer = await repository.lockCurrentPeriod(period);
          if (pointer?.current_cash_close_id !== cashCloseId)
            throw new ReportingError(
              'CASH_CLOSE_NOT_CURRENT',
              'This cash close is no longer current.',
            );
          return this.persist(
            transaction,
            period,
            predecessor.currency_code,
            context,
            idempotencyRequestId,
            predecessor,
            reason.trim(),
          );
        },
      ),
    );
  }

  private async persist(
    transaction: Transaction<Database>,
    period: ResolvedReportingPeriod,
    currencyCode: string,
    context: ReportCommandContext,
    idempotencyRequestId: string,
    predecessor: CashCloseProjection | null,
    reason: string | null,
  ) {
    const reports = new ReportRepository(transaction);
    const groups = await reports.financialGroups(period);
    const sales = await reports.contributingSales(period);
    const lines = REPORTING_GROUPS.map((reportingGroup) => ({
      reportingGroup,
      total: groups.find((row) => row.reportingGroup === reportingGroup)?.total ?? '0.00',
    }));
    const grossTotal = sumMoney(lines.map((line) => line.total));
    if (grossTotal !== sumMoney(sales.map((sale) => sale.includedAmount)))
      throw new ReportingError(
        'CASH_CLOSE_TOTAL_MISMATCH',
        'Stored sale and line totals do not reconcile.',
      );
    const repository = new CashCloseRepository(transaction);
    const id = randomUUID();
    await repository.insertClose({
      ...period,
      id,
      closeNumber: `CC-${id.toUpperCase()}`,
      currencyCode,
      grossTotal,
      partnerRate: '0.500000',
      ...calculatePartnerShare(grossTotal),
      roundingMode: 'HALF_AWAY_FROM_ZERO',
      createdBy: context.actorId,
      idempotencyRequestId,
      supersedesCashCloseId: predecessor?.id ?? null,
      correctionReason: reason,
    });
    await repository.insertLines(id, lines);
    await repository.insertSales(id, sales);
    if (predecessor) {
      if (!(await repository.compareAndSwapCurrent(period, predecessor.id, id)))
        throw new ReportingError('CASH_CLOSE_NOT_CURRENT', 'This cash close is no longer current.');
    } else if (!(await repository.tryInsertCurrentPeriod(period, id))) {
      throw new ReportingError(
        'CASH_CLOSE_PERIOD_ALREADY_CURRENT',
        'A current cash close already exists for this period.',
      );
    }
    const result = cashCloseResource((await repository.detail(id))!);
    await new AuditWriter().write(transaction, {
      actorId: context.actorId,
      action: predecessor ? 'CASH_CLOSE_CORRECTED' : 'CASH_CLOSE_CREATED',
      entityType: 'CASH_CLOSE',
      entityId: id,
      requestId: context.requestId,
      ...(reason ? { reason } : {}),
      ...(predecessor
        ? { before: { ...cashCloseResource(predecessor), currentCashCloseId: predecessor.id } }
        : {}),
      after: { ...result, currentCashCloseId: id },
    });
    return result;
  }
}

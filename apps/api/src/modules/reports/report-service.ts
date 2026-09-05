import type { Transaction } from 'kysely';
import type { AppDatabase } from '../../db/database.js';
import type { Database, JsonValue, ReportType } from '../../db/types.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { calculatePartnerShare, sumMoney } from '../../shared/money.js';
import { REPORTING_GROUPS } from './financial-calculations.js';
import { reportingInstant } from './cash-close-service.js';
import { ReportRepository } from './report-repository.js';
import { ReportingError, runReportCommand, type ReportCommandContext } from './report-command.js';
import { resolveReportingPeriod, type ReportingPeriodKind } from './reporting-period.js';

export interface ReportRequest {
  reportType: ReportType;
  filters: Record<string, unknown>;
}

export class ReportService {
  constructor(private readonly database: AppDatabase) {}

  read(input: ReportRequest, actorId: string) {
    return this.database
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (transaction) => {
        const actor = await transaction
          .selectFrom('app_user')
          .select(['active', 'role'])
          .where('id', '=', actorId)
          .executeTakeFirst();
        if (!actor?.active || actor.role !== 'ADMINISTRATOR')
          throw new ReportingError('REPORT_FORBIDDEN', 'Administrator access is required.');
        return (await this.generate(transaction, input)).report;
      });
  }

  snapshot(input: ReportRequest, context: ReportCommandContext) {
    return runSerializable(this.database, (transaction) =>
      runReportCommand(
        transaction,
        'REPORT_SNAPSHOT_CREATE',
        'REPORT_SNAPSHOT',
        JSON.parse(JSON.stringify(input)) as JsonValue,
        context,
        async (idempotencyRequestId) => {
          const generated = await this.generate(transaction, input);
          const row = await new ReportRepository(transaction).insertSnapshot({
            reportType: input.reportType,
            filters: generated.report.filters,
            businessTimezone: generated.report.businessTimezone,
            sourceWatermark: generated.sourceWatermark,
            result: JSON.parse(JSON.stringify(generated.report)) as JsonValue,
            createdBy: context.actorId,
            idempotencyRequestId,
          });
          const result = {
            id: row.id,
            reportType: row.report_type,
            filters: row.filters,
            businessTimezone: row.business_timezone,
            sourceWatermark: row.source_watermark,
            result: row.result,
            createdBy: row.created_by,
            createdAt: reportingInstant(row.created_at),
          };
          await new AuditWriter().write(transaction, {
            actorId: context.actorId,
            action: 'REPORT_SNAPSHOT_CREATED',
            entityType: 'REPORT_SNAPSHOT',
            entityId: row.id,
            requestId: context.requestId,
            after: {
              reportType: row.report_type,
              filters: row.filters,
              sourceWatermark: row.source_watermark,
            },
          });
          return result;
        },
      ),
    );
  }

  private async generate(transaction: Transaction<Database>, input: ReportRequest) {
    const settings = await transaction
      .selectFrom('business_setting')
      .selectAll()
      .executeTakeFirstOrThrow();
    const repository = new ReportRepository(transaction);
    const generatedAt = reportingInstant(new Date());
    if (input.reportType === 'INVENTORY_BY_BRANCH') {
      if (Object.keys(input.filters).length)
        throw new ReportingError(
          'INVALID_REPORT_FILTERS',
          'The inventory report shows current stock and does not accept a calendar period.',
        );
      return {
        report: {
          reportType: input.reportType,
          businessTimezone: settings.business_timezone,
          generatedAt,
          filters: {} as Record<string, string>,
          rows: await repository.inventoryByBranch(),
        },
        sourceWatermark: await repository.inventorySourceWatermark(),
      };
    }
    if (
      !['SALES_BY_DRIVER', 'BEST_SELLING_PRODUCTS', 'FINANCIAL_SUMMARY'].includes(input.reportType)
    )
      throw new ReportingError('INVALID_REPORT_TYPE', 'The report type is invalid.');
    if (Object.keys(input.filters).some((key) => !['periodKind', 'anchorDate'].includes(key)))
      throw new ReportingError('INVALID_REPORT_FILTERS', 'The report filters are invalid.');
    const period = resolveReportingPeriod({
      periodKind: input.filters.periodKind as ReportingPeriodKind,
      anchorDate: input.filters.anchorDate as string,
      businessTimezone: settings.business_timezone,
    });
    const groups = await repository.financialGroups(period);
    const lines = REPORTING_GROUPS.map((reportingGroup) => ({
      reportingGroup,
      total: groups.find((row) => row.reportingGroup === reportingGroup)?.total ?? '0.00',
    }));
    const grossTotal = sumMoney(lines.map((line) => line.total));
    const rows =
      input.reportType === 'SALES_BY_DRIVER'
        ? await repository.salesByDriver(period)
        : input.reportType === 'BEST_SELLING_PRODUCTS'
          ? await repository.bestSellingProducts(period)
          : lines;
    return {
      report: {
        reportType: input.reportType,
        businessTimezone: settings.business_timezone,
        generatedAt,
        filters: {
          periodKind: period.periodKind,
          anchorDate: period.anchorDate,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        },
        rows,
        totals: {
          currencyCode: settings.currency_code,
          grossTotal,
          partnerRate: '0.500000',
          ...calculatePartnerShare(grossTotal),
        },
      },
      sourceWatermark: await repository.saleSourceWatermark(period),
    };
  }
}

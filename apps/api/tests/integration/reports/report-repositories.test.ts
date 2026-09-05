import { sql, type Kysely } from 'kysely';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReportService } from '../../../src/modules/reports/report-service.js';
import { AuditWriter } from '../../../src/shared/audit/audit-service.js';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import type { Database } from '../../../src/db/types.js';
import {
  CashCloseRepository,
  type CashCloseInsert,
} from '../../../src/modules/reports/cash-close-repository.js';
import { ReportRepository } from '../../../src/modules/reports/report-repository.js';
import { resolveReportingPeriod } from '../../../src/modules/reports/reporting-period.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { CancellationService } from '../../../src/modules/sales/cancellation-service.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('report repositories and database history constraints', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let actorId: string;
  const period = resolveReportingPeriod({
    periodKind: 'WEEK',
    anchorDate: '2026-09-04',
    businessTimezone: 'America/Hermosillo',
  });

  beforeAll(async () => {
    container = await startPostgres();
    database = createDatabase(container.connectionString);
    await resetDatabase(database);
    await migrateToLatest(
      database,
      fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url)),
    );
    await seedFoundation(database);
    actorId = (
      await database
        .selectFrom('app_user')
        .select('id')
        .where('username', '=', 'admin')
        .executeTakeFirstOrThrow()
    ).id;
  }, 120_000);

  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  async function closeInput(
    db: Kysely<Database>,
    overrides: Partial<CashCloseInsert> = {},
  ): Promise<CashCloseInsert> {
    const request = await db
      .insertInto('idempotency_request')
      .values({
        actor_id: actorId,
        operation_type: 'TEST_CLOSE',
        idempotency_key: crypto.randomUUID(),
        request_hash: 'fixture',
        state: 'IN_PROGRESS',
        resource_type: null,
        resource_id: null,
        http_status: null,
        response_snapshot: null,
        completed_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return {
      ...period,
      closeNumber: `CC-${crypto.randomUUID()}`,
      currencyCode: 'MXN',
      grossTotal: '10.01',
      partnerRate: '0.500000',
      partnerAmount: '5.01',
      remainingAmount: '5.00',
      roundingMode: 'HALF_AWAY_FROM_ZERO',
      createdBy: actorId,
      idempotencyRequestId: request.id,
      supersedesCashCloseId: null,
      correctionReason: null,
      ...overrides,
    };
  }

  it('inserts and replaces one current pointer, preserves history, and rejects invalid chains', async () => {
    const original = await database.transaction().execute(async (tx) => {
      const repository = new CashCloseRepository(tx);
      const row = await repository.insertClose(await closeInput(tx));
      await repository.insertLines(row.id, [{ reportingGroup: 'OTHER', total: '10.01' }]);
      expect(await repository.tryInsertCurrentPeriod(period, row.id)).toBe(true);
      expect(await repository.tryInsertCurrentPeriod(period, row.id)).toBe(false);
      return row;
    });
    const corrected = await database.transaction().execute(async (tx) => {
      const repository = new CashCloseRepository(tx);
      expect((await repository.lockCurrentPeriod(period))?.current_cash_close_id).toBe(original.id);
      const successor = await repository.insertClose(
        await closeInput(tx, {
          supersedesCashCloseId: original.id,
          correctionReason: 'Reconciled activity',
        }),
      );
      expect(
        await repository.compareAndSwapCurrent(period, crypto.randomUUID(), successor.id),
      ).toBe(false);
      expect(await repository.compareAndSwapCurrent(period, original.id, successor.id)).toBe(true);
      return successor;
    });
    const repository = new CashCloseRepository(database);
    expect(await repository.detail(original.id)).toMatchObject({
      status: 'SUPERSEDED',
      superseded_by_cash_close_id: corrected.id,
      gross_total: '10.01',
      lines: [{ reporting_group: 'OTHER', total: '10.01' }],
    });
    expect(await repository.detail(corrected.id)).toMatchObject({
      status: 'CURRENT',
      supersedes_cash_close_id: original.id,
    });
    const sameWeek = resolveReportingPeriod({ ...period, anchorDate: '2026-09-06' });
    expect(
      (await repository.list({ period: sameWeek, status: 'CURRENT' })).items.map((row) => row.id),
    ).toEqual([corrected.id]);
    expect(
      (await repository.list({ period, status: 'SUPERSEDED' })).items.map((row) => row.id),
    ).toEqual([original.id]);

    await expect(
      database.transaction().execute(async (tx) => {
        await new CashCloseRepository(tx).insertClose(
          await closeInput(tx, { supersedesCashCloseId: original.id, correctionReason: 'Branch' }),
        );
      }),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.transaction().execute(async (tx) => {
        await new CashCloseRepository(tx).insertClose(
          await closeInput(tx, {
            supersedesCashCloseId: corrected.id,
            correctionReason: 'Wrong period',
            periodEnd: '2026-09-08T07:00:00Z',
          }),
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      database
        .updateTable('cash_close')
        .set({ gross_total: '20.00' })
        .where('id', '=', original.id)
        .execute(),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      database.deleteFrom('cash_close_line').where('cash_close_id', '=', original.id).execute(),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      database
        .updateTable('cash_close_current_period')
        .set({ period_end: '2026-09-08T07:00:00Z' })
        .where('current_cash_close_id', '=', corrected.id)
        .execute(),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('saves repeatable exact reports with audit and replay, and rolls back a failed snapshot', async () => {
    const service = new ReportService(database);
    const input = {
      reportType: 'FINANCIAL_SUMMARY' as const,
      filters: { periodKind: 'DAY', anchorDate: '2026-11-01' },
    };
    await database
      .updateTable('business_setting')
      .set({ business_timezone: 'America/New_York' })
      .execute();
    try {
      const report = await service.read(input, actorId);
      expect(report.filters).toMatchObject({
        periodStart: '2026-11-01T04:00:00Z',
        periodEnd: '2026-11-02T05:00:00Z',
      });
      const context = {
        actorId,
        idempotencyKey: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      };
      const saved = await service.snapshot(input, context);
      expect(saved.result).toMatchObject({
        totals: { grossTotal: '0.00', partnerAmount: '0.00', remainingAmount: '0.00' },
      });
      expect(await service.snapshot(input, context)).toEqual(saved);
      expect(
        await database
          .selectFrom('audit_event')
          .select('action')
          .where('entity_id', '=', saved.id)
          .execute(),
      ).toEqual([{ action: 'REPORT_SNAPSHOT_CREATED' }]);
      const failedContext = { ...context, idempotencyKey: crypto.randomUUID() };
      const audit = vi
        .spyOn(AuditWriter.prototype, 'write')
        .mockRejectedValue(new Error('Audit unavailable'));
      try {
        await expect(service.snapshot(input, failedContext)).rejects.toThrow('Audit unavailable');
      } finally {
        audit.mockRestore();
      }
      expect(
        await database
          .selectFrom('idempotency_request')
          .select('id')
          .where('idempotency_key', '=', failedContext.idempotencyKey)
          .execute(),
      ).toEqual([]);
      expect(await database.selectFrom('report_snapshot').select('id').execute()).toHaveLength(1);
      const driver = await database
        .selectFrom('app_user')
        .select('id')
        .where('username', '=', 'driver')
        .executeTakeFirstOrThrow();
      await expect(service.read(input, driver.id)).rejects.toMatchObject({
        code: 'REPORT_FORBIDDEN',
      });
    } finally {
      await database
        .updateTable('business_setting')
        .set({ business_timezone: 'America/Hermosillo' })
        .execute();
    }
  });

  it('paginates records sharing a submillisecond timestamp without omission', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      const input = await closeInput(database, { anchorDate: '2027-01-01' });
      const inserted = await sql<{ id: string }>`insert into cash_close
        (close_number, period_kind, anchor_date, business_timezone, period_start, period_end, currency_code, gross_total, partner_rate, partner_amount, remaining_amount, rounding_mode, created_by, idempotency_request_id, created_at)
        values (${input.closeNumber}, 'DAY', '2027-01-01', 'America/Hermosillo', '2027-01-01T07:00:00Z', '2027-01-02T07:00:00Z', 'MXN', 0, 0.5, 0, 0, 'HALF_AWAY_FROM_ZERO', ${actorId}, ${input.idempotencyRequestId}, '2027-01-02T00:00:00.123456Z') returning id`.execute(
        database,
      );
      ids.push(inserted.rows[0]!.id);
    }
    const repository = new CashCloseRepository(database);
    const filter = resolveReportingPeriod({
      periodKind: 'DAY',
      anchorDate: '2027-01-01',
      businessTimezone: 'America/Hermosillo',
    });
    const first = await repository.list({ period: filter, limit: 1 });
    const second = await repository.list({ period: filter, limit: 1, cursor: first.nextCursor! });
    const third = await repository.list({ period: filter, limit: 1, cursor: second.nextCursor! });
    expect([...first.items, ...second.items, ...third.items].map((row) => row.id)).toEqual(
      ids.sort().reverse(),
    );
    expect(third.hasNextPage).toBe(false);
    expect(third.nextCursor).toBeNull();
  });

  it('aggregates exact stored lines with inclusive start/exclusive end and excludes cancellations', async () => {
    const scenario = await createSaleScenario(database, {
      stockQuantity: '10.000',
      standardUnitPrice: '10.0050',
    });
    const service = new SaleService(database);
    async function saleAt(time: string) {
      const sale = await service.confirm(
        saleCommand({
          customerId: scenario.customer.id,
          routeId: scenario.route.id,
          productId: scenario.product.id,
        }),
        {
          actorId: scenario.driver.id,
          idempotencyKey: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
        },
      );
      await database
        .updateTable('sale')
        .set({ completed_at: time })
        .where('id', '=', sale.id)
        .execute();
      return sale;
    }
    const start = await saleAt(period.periodStart);
    await saleAt(period.periodEnd);
    const cancelled = await saleAt('2026-09-03T15:00:00Z');
    await new CancellationService(database).cancel(cancelled.id, 'Test cancellation', {
      actorId,
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    });
    const reports = new ReportRepository(database);
    const originalProducts = await reports.bestSellingProducts(period);
    expect(originalProducts).toEqual([
      {
        productId: scenario.product.id,
        productName: scenario.product.name,
        quantity: '1.000',
        total: '10.01',
      },
    ]);
    expect(await reports.financialGroups(period)).toEqual([
      { reportingGroup: 'SODAS', total: '10.01' },
    ]);
    expect(await reports.contributingSales(period)).toEqual([
      { saleId: start.id, includedAmount: '10.01' },
    ]);
    expect(await reports.salesByDriver(period)).toEqual([
      {
        driverId: scenario.driver.id,
        driverName: 'Sale integration driver',
        saleCount: '1',
        total: '10.01',
      },
    ]);
    await database
      .updateTable('product')
      .set({ name: 'Renamed', standard_unit_price: '999.0000' })
      .where('id', '=', scenario.product.id)
      .execute();
    expect(await reports.bestSellingProducts(period)).toEqual(originalProducts);
    const watermark = await reports.saleSourceWatermark(period);
    expect(watermark).toMatch(/^[a-f0-9]{64}$/);
    expect(await reports.inventorySourceWatermark()).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await reports.inventoryByBranch()).every((row) => typeof row.quantity === 'string'),
    ).toBe(true);
    const input = await closeInput(database);
    const snapshot = await reports.insertSnapshot({
      reportType: 'BEST_SELLING_PRODUCTS',
      filters: { ...period },
      businessTimezone: period.businessTimezone,
      sourceWatermark: watermark,
      result: { rows: originalProducts.map((row) => ({ ...row })) },
      createdBy: actorId,
      idempotencyRequestId: input.idempotencyRequestId,
    });
    await expect(
      database.deleteFrom('report_snapshot').where('id', '=', snapshot.id).execute(),
    ).rejects.toMatchObject({ code: '55000' });
  });
});

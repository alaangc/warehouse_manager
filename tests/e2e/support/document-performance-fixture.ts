import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { AppDatabase } from '../../../apps/api/src/db/database.js';
import { RouteLoadService } from '../../../apps/api/src/modules/routes/route-load-service.js';
import { CashCloseService } from '../../../apps/api/src/modules/reports/cash-close-service.js';
import { ReportService } from '../../../apps/api/src/modules/reports/report-service.js';
import { performanceId } from './performance-profile.js';

export const documentPerformanceSeed = 'warehouse-t139-v1';
export const documentKinds = ['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT'] as const;
export type DocumentKind = (typeof documentKinds)[number];
export type PerformanceSource = {
  documentType: DocumentKind;
  sourceType: 'SALE' | 'ROUTE_LOAD' | 'CASH_CLOSE' | 'REPORT_SNAPSHOT';
  sourceId: string;
};
const id = (kind: number, n: number) =>
  `00000000-0000-4000-8000-${String(kind).padStart(2, '0')}${String(n).padStart(10, '0')}`;

// Reuse T138's exact population, spreading its sales 108 seconds apart so each
// daily cash close/report has real contributing sales. All new business sources
// are committed through production services before any timed output request.
export async function prepareDocumentSources(database: AppDatabase) {
  const sources: Record<DocumentKind, PerformanceSource[]> = {
    TICKET: [],
    ROUTE_LOAD: [],
    CASH_CLOSE: [],
    REPORT: [],
  };
  const adminId = '00000000-0000-4000-8000-000000000010';
  const actor = await database
    .selectFrom('app_user')
    .select('password_hash')
    .where('id', '=', adminId)
    .executeTakeFirstOrThrow();
  const loads = new RouteLoadService(database);
  const closes = new CashCloseService(database);
  const reports = new ReportService(database);
  const context = (actorId = adminId) => ({
    actorId,
    requestId: `${documentPerformanceSeed}-${randomUUID()}`,
    idempotencyKey: randomUUID(),
  });
  for (let n = 0; n < 125; n++) {
    const driverId = id(20, n);
    const vehicleId = id(21, n);
    await database
      .insertInto('app_user')
      .values({
        id: driverId,
        username: `pdf-driver-${n}`,
        display_name: `PDF Driver ${n}`,
        password_hash: actor.password_hash,
        role: 'DRIVER',
      })
      .execute();
    await database
      .insertInto('vehicle')
      .values({
        id: vehicleId,
        code: `PDF-${n}`,
        name: `PDF Vehicle ${n}`,
        registration: null,
      })
      .execute();
    const date = new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
    const route = await loads.create(
      {
        routeNumber: `PDF-ROUTE-${n}`,
        originLocationId: '00000000-0000-4000-8000-000000000020',
        driverId,
        vehicleId,
        businessDate: date,
      },
      context(),
    );
    const draft = await loads.saveDraft(
      route.id,
      1,
      Array.from({ length: 10 }, (_, line) => ({
        productId: performanceId('product', n * 10 + line + 1),
        quantity: '1.000',
      })),
      context(driverId),
    );
    await loads.confirm(route.id, draft.version, context(driverId));
    const confirmed = await database
      .selectFrom('route_load')
      .select(['id', 'state'])
      .where('id', '=', draft.id)
      .executeTakeFirstOrThrow();
    assert.equal(confirmed.state, 'CONFIRMED');
    const period = { periodKind: 'DAY' as const, anchorDate: date };
    const cash = await closes.create(period, context());
    assert(Number(cash.grossTotal) > 0);
    assert(cash.contributingSaleIds.length > 0);
    const report = await reports.snapshot(
      { reportType: 'FINANCIAL_SUMMARY', filters: period },
      context(),
    );
    sources.TICKET.push({
      documentType: 'TICKET',
      sourceType: 'SALE',
      sourceId: performanceId('sale', n + 1),
    });
    sources.ROUTE_LOAD.push({
      documentType: 'ROUTE_LOAD',
      sourceType: 'ROUTE_LOAD',
      sourceId: draft.id,
    });
    sources.CASH_CLOSE.push({
      documentType: 'CASH_CLOSE',
      sourceType: 'CASH_CLOSE',
      sourceId: cash.id,
    });
    sources.REPORT.push({
      documentType: 'REPORT',
      sourceType: 'REPORT_SNAPSHOT',
      sourceId: report.id,
    });
    if ((n + 1) % 25 === 0) process.stdout.write(`Prepared ${n + 1}/125 source sets\n`);
  }
  await sql`analyze`.execute(database);
  const documents = await database.selectFrom('document_output').select('id').execute();
  assert.equal(documents.length, 0, 'No canonical PDF may exist before warmup');
  assert.equal(
    new Set(
      Object.values(sources)
        .flat()
        .map((source) => source.sourceId),
    ).size,
    500,
  );
  return sources;
}

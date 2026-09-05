import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedFoundation } from '../../../../../database/seeds/001_foundation.js';
import { createDatabase, type AppDatabase } from '../../../src/db/database.js';
import { migrateToLatest } from '../../../src/db/migrate.js';
import { CashCloseService } from '../../../src/modules/reports/cash-close-service.js';
import { CashCloseRepository } from '../../../src/modules/reports/cash-close-repository.js';
import { AuditWriter } from '../../../src/shared/audit/audit-service.js';
import { startPostgres, type TestDatabase } from '../../support/postgres-container.js';
import { resetDatabase } from '../../support/reset-database.js';

describe('transactional cash-close service', () => {
  let container: TestDatabase;
  let database: AppDatabase;
  let service: CashCloseService;
  let actorId: string;
  const input = { periodKind: 'DAY' as const, anchorDate: '2026-09-04' };
  const context = () => ({
    actorId,
    idempotencyKey: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
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
    service = new CashCloseService(database);
  }, 120_000);
  afterAll(async () => {
    await database?.destroy();
    await container?.container.stop();
  });

  it('replays original responses after correction, rejects changed keys and stale corrections', async () => {
    const createContext = context();
    const original = await service.create(input, createContext);
    expect(original).toMatchObject({
      anchorDate: input.anchorDate,
      status: 'CURRENT',
      grossTotal: '0.00',
      periodStart: '2026-09-04T07:00:00Z',
    });
    expect(original.lines).toHaveLength(4);
    expect(await service.create(input, createContext)).toEqual(original);
    await expect(
      service.create({ ...input, anchorDate: '2026-09-05' }, createContext),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(service.create(input, context())).rejects.toMatchObject({
      code: 'CASH_CLOSE_PERIOD_ALREADY_CURRENT',
    });
    const correctionContext = context();
    const successor = await service.correct(original.id, 'Reconciled activity', correctionContext);
    expect(successor).toMatchObject({
      supersedesCashCloseId: original.id,
      status: 'CURRENT',
      anchorDate: original.anchorDate,
    });
    expect(await service.correct(original.id, 'Reconciled activity', correctionContext)).toEqual(
      successor,
    );
    expect(await service.create(input, createContext)).toEqual(original);
    await expect(service.correct(original.id, 'Stale target', context())).rejects.toMatchObject({
      code: 'CASH_CLOSE_NOT_CURRENT',
    });
    expect(await new CashCloseRepository(database).detail(original.id)).toMatchObject({
      status: 'SUPERSEDED',
      superseded_by_cash_close_id: successor.id,
    });
    const audit = await database
      .selectFrom('audit_event')
      .selectAll()
      .where('entity_id', '=', successor.id)
      .executeTakeFirstOrThrow();
    expect(audit.before_values).toMatchObject({ currentCashCloseId: original.id });
    expect(audit.after_values).toMatchObject({ currentCashCloseId: successor.id });
    expect(() => service.correct(successor.id, ' ', context())).toThrow();
  });

  it('allows exactly one winner for independent concurrent creates and corrections', async () => {
    const requests = await Promise.allSettled([
      service.create({ ...input, anchorDate: '2026-09-10' }, context()),
      service.create({ ...input, anchorDate: '2026-09-10' }, context()),
    ]);
    expect(requests.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(requests.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'CASH_CLOSE_PERIOD_ALREADY_CURRENT' },
    });
    const winner = requests.find((result) => result.status === 'fulfilled')!;
    if (winner.status !== 'fulfilled') throw new Error('No close created');
    const corrections = await Promise.allSettled([
      service.correct(winner.value.id, 'Correction A', context()),
      service.correct(winner.value.id, 'Correction B', context()),
    ]);
    expect(corrections.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(corrections.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'CASH_CLOSE_NOT_CURRENT' },
    });
  });

  it('rolls back new history, current pointer, and idempotency when auditing fails', async () => {
    const original = await service.create({ ...input, anchorDate: '2026-09-20' }, context());
    const commandContext = context();
    const audit = vi
      .spyOn(AuditWriter.prototype, 'write')
      .mockRejectedValue(new Error('Injected audit failure'));
    try {
      await expect(
        service.correct(original.id, 'Rollback correction', commandContext),
      ).rejects.toThrow('Injected audit failure');
    } finally {
      audit.mockRestore();
    }
    expect(await new CashCloseRepository(database).detail(original.id)).toMatchObject({
      status: 'CURRENT',
      superseded_by_cash_close_id: null,
    });
    expect(
      await database
        .selectFrom('cash_close')
        .select('id')
        .where('supersedes_cash_close_id', '=', original.id)
        .execute(),
    ).toEqual([]);
    expect(
      await database
        .selectFrom('idempotency_request')
        .select('id')
        .where('idempotency_key', '=', commandContext.idempotencyKey)
        .execute(),
    ).toEqual([]);
    const driver = await database
      .selectFrom('app_user')
      .select('id')
      .where('username', '=', 'driver')
      .executeTakeFirstOrThrow();
    await expect(service.create(input, { ...context(), actorId: driver.id })).rejects.toMatchObject(
      { code: 'REPORT_FORBIDDEN' },
    );
  });
});

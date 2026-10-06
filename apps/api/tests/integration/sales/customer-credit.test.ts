import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '../../support/openapi-contract-setup.js';
import { sql } from 'kysely';
import { administrationHarness } from '../../support/administration-harness.js';
import { createSaleScenario, saleCommand } from '../../support/sales-factories.js';
import { SaleService } from '../../../src/modules/sales/sale-service.js';
import { CreditService } from '../../../src/modules/sales/credit-service.js';
import { CancellationService } from '../../../src/modules/sales/cancellation-service.js';
import { ReportRepository } from '../../../src/modules/reports/report-repository.js';

describe('USD notes, checks and customer credit', () => {
  let h: Awaited<ReturnType<typeof administrationHarness>>;
  beforeAll(async () => {
    h = await administrationHarness();
  }, 120_000);
  afterAll(async () => {
    await h?.close();
  });
  const context = (actorId: string) => ({
    actorId,
    idempotencyKey: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
  });
  async function scenario() {
    const fixture = await createSaleScenario(h.database, {
      stockQuantity: '20',
      standardUnitPrice: '4.2500',
    });
    const create = (method: 'CREDIT' | 'CHECK' = 'CREDIT') =>
      new SaleService(h.database).confirm(
        {
          ...saleCommand({
            customerId: fixture.customer.id,
            routeId: fixture.route.id,
            productId: fixture.product.id,
          }),
          paymentMethod: method,
        },
        context(fixture.driver.id),
      );
    return { ...fixture, create };
  }
  it('assigns consecutive notes, preserves exact dollar amounts, accepts checks and replays without consuming a number', async () => {
    const f = await scenario();
    const command = {
      ...saleCommand({ customerId: f.customer.id, routeId: f.route.id, productId: f.product.id }),
      paymentMethod: 'CHECK' as const,
    };
    const ctx = context(f.driver.id);
    const first = await new SaleService(h.database).confirm(command, ctx);
    expect(first).toMatchObject({
      saleNumber: 'Nota: 001',
      ticketNumber: 'Nota: 001',
      currencyCode: 'USD',
      total: '4.25',
      paymentMethod: 'CHECK',
    });
    expect(await new SaleService(h.database).confirm(command, ctx)).toEqual(first);
    expect((await f.create()).saleNumber).toBe('Nota: 002');
    await sql`update sale_note_counter set value = 10600 where id = 1`.execute(h.database);
    expect((await f.create()).saleNumber).toBe('Nota: 10601');
  });
  it('settles multiple notes exactly once, retains product descriptions and enables PDF and thermal reprinting', async () => {
    const f = await scenario();
    const one = await f.create();
    const two = await f.create();
    const admin = await h.login('admin');
    const service = new CreditService(h.database);
    expect(await service.list(f.customer.id)).toMatchObject({ noteCount: 2, total: '8.50' });
    const input = { saleIds: [one.id, two.id], paymentMethod: 'CHECK' };
    const key = crypto.randomUUID();
    const pay = () =>
      h
        .send(admin, 'post', `/customers/${f.customer.id}/credit-payments`, input)
        .set('Idempotency-Key', key);
    const response = await pay();
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      total: '8.50',
      snapshot: { customerName: f.customer.display_name, paymentMethod: 'CHECK' },
    });
    expect(
      response.body.data.snapshot.lines.map((l: { productName: string }) => l.productName),
    ).toEqual(
      expect.arrayContaining([
        `${one.saleNumber} - ${f.product.name}`,
        `${two.saleNumber} - ${f.product.name}`,
      ]),
    );
    expect((await pay()).body).toEqual(response.body);
    expect(await service.list(f.customer.id)).toMatchObject({ noteCount: 0, total: '0.00' });
    const generated = await h
      .send(admin, 'post', '/documents', {
        documentType: 'CREDIT_RECEIPT',
        sourceType: 'CREDIT_PAYMENT',
        sourceId: response.body.data.id,
      })
      .set('Idempotency-Key', crypto.randomUUID());
    expect(generated.status).toBe(202);
    expect(generated.body.data.state).toBe('READY');
    const print = await h.send(admin, 'get', `/documents/${generated.body.data.id}/print-data`);
    expect(print.status).toBe(200);
    expect(print.body.data.snapshot.saleNumber).toContain(one.saleNumber);
    expect(print.body.data.snapshot.total).toBe('8.50');
    await expect(
      new CancellationService(h.database).cancel(
        one.id,
        'Cannot cancel paid credit',
        context(f.admin.id),
      ),
    ).rejects.toMatchObject({ code: 'CREDIT_ALREADY_PAID' });
  });
  it('rejects mixed customers and cancelled notes atomically', async () => {
    const f = await scenario(),
      other = await scenario();
    const one = await f.create(),
      two = await other.create();
    const service = new CreditService(h.database);
    await expect(
      service.pay(
        f.customer.id,
        { saleIds: [one.id, two.id], paymentMethod: 'CASH' },
        context(f.admin.id),
      ),
    ).rejects.toMatchObject({ code: 'CREDIT_NOT_PAYABLE' });
    expect((await service.list(f.customer.id)).noteCount).toBe(1);
    await new CancellationService(h.database).cancel(one.id, 'Returned', context(f.admin.id));
    expect((await service.list(f.customer.id)).noteCount).toBe(0);
    await expect(
      service.pay(f.customer.id, { saleIds: [one.id], paymentMethod: 'CASH' }, context(f.admin.id)),
    ).rejects.toMatchObject({ code: 'CREDIT_NOT_PAYABLE' });
  });
  it('allows only one concurrent settlement of the same note', async () => {
    const f = await scenario(),
      note = await f.create();
    const service = new CreditService(h.database);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.pay(
          f.customer.id,
          { saleIds: [note.id], paymentMethod: 'CASH' },
          context(f.admin.id),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await service.list(f.customer.id)).payments).toHaveLength(1);
  });
  it('recognizes credit in collections on the payment date and not on the sale date', async () => {
    const f = await scenario(),
      note = await f.create();
    await h.database
      .updateTable('sale')
      .set({ completed_at: '2020-01-01T12:00:00Z' })
      .where('id', '=', note.id)
      .execute();
    const reports = new ReportRepository(h.database);
    const old = { periodStart: '2020-01-01T00:00:00Z', periodEnd: '2020-01-02T00:00:00Z' };
    expect(await reports.contributingSales(old)).toEqual(
      expect.arrayContaining([{ saleId: note.id, includedAmount: '4.25' }]),
    );
    expect(await reports.contributingSales(old, true)).toEqual([]);
    await new CreditService(h.database).pay(
      f.customer.id,
      { saleIds: [note.id], paymentMethod: 'BANK_TRANSFER' },
      context(f.admin.id),
    );
    expect(await reports.contributingSales(old, true)).toEqual([]);
    expect(
      await reports.contributingSales(
        { periodStart: '2021-01-01T00:00:00Z', periodEnd: '2099-01-01T00:00:00Z' },
        true,
      ),
    ).toEqual(expect.arrayContaining([{ saleId: note.id, includedAmount: '4.25' }]));
  });
  it('restricts credit collection and receipts to administrators', async () => {
    const f = await scenario(),
      note = await f.create();
    const driver = await h.login('driver');
    expect((await h.send(driver, 'get', `/customers/${f.customer.id}/credits`)).status).toBe(403);
    expect(
      (
        await h
          .send(driver, 'post', `/customers/${f.customer.id}/credit-payments`, {
            saleIds: [note.id],
            paymentMethod: 'CASH',
          })
          .set('Idempotency-Key', crypto.randomUUID())
      ).status,
    ).toBe(403);
  });
});

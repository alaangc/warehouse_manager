import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency-repository.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';
import { sumMoney } from '../../shared/money.js';
import type { SaleContext } from './sale-service.js';

export const CreditPaymentSchema = z
  .object({
    saleIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK']),
  })
  .strict();

export class CreditService {
  constructor(private readonly database: AppDatabase) {}

  async list(customerId: string) {
    const notes = await this.database
      .selectFrom('sale as s')
      .leftJoin('credit_payment_sale as p', 'p.sale_id', 's.id')
      .select([
        's.id',
        's.sale_number as saleNumber',
        's.total',
        's.currency_code as currencyCode',
        's.completed_at as completedAt',
      ])
      .where('s.customer_id', '=', customerId)
      .where('s.payment_method', '=', 'CREDIT')
      .where('s.status', '=', 'COMPLETED')
      .where('p.sale_id', 'is', null)
      .orderBy('s.completed_at')
      .orderBy('s.id')
      .execute();
    const payments = await this.database
      .selectFrom('credit_payment')
      .select([
        'id',
        'receipt_number as receiptNumber',
        'total',
        'currency_code as currencyCode',
        'created_at as createdAt',
      ])
      .where('customer_id', '=', customerId)
      .orderBy('created_at', 'desc')
      .execute();
    return {
      notes,
      noteCount: notes.length,
      total: sumMoney(notes.map((n) => n.total)),
      currencyCode: 'USD',
      payments,
    };
  }

  pay(customerId: string, raw: unknown, context: SaleContext) {
    const input = CreditPaymentSchema.parse(raw);
    return runSerializable(this.database, async (transaction) => {
      const idempotency = new IdempotencyRepository();
      const acquired = await idempotency.acquire(transaction, {
        actorId: context.actorId,
        operationType: 'CREDIT_PAYMENT',
        key: context.idempotencyKey,
        requestHash: canonicalRequestHash({
          customerId,
          ...input,
          saleIds: [...input.saleIds].sort(),
        }),
      });
      if (acquired.kind === 'replay') return acquired.body;
      if (acquired.kind !== 'acquired')
        throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Conflict');
      const customer = await transaction
        .selectFrom('customer')
        .select(['id', 'display_name'])
        .where('id', '=', customerId)
        .executeTakeFirst();
      if (!customer) throw new HttpProblem(404, 'CUSTOMER_NOT_FOUND', 'Not Found');
      // Lock in a stable order, shared with cancellation. The unique allocation is a second guard.
      const notes = await transaction
        .selectFrom('sale')
        .selectAll()
        .where('id', 'in', input.saleIds)
        .where('customer_id', '=', customerId)
        .orderBy('id')
        .forUpdate()
        .execute();
      const paid = await transaction
        .selectFrom('credit_payment_sale')
        .select('sale_id')
        .where('sale_id', 'in', input.saleIds)
        .execute();
      if (
        notes.length !== input.saleIds.length ||
        paid.length ||
        notes.some(
          (n) =>
            n.payment_method !== 'CREDIT' || n.status !== 'COMPLETED' || n.currency_code !== 'USD',
        )
      )
        throw new HttpProblem(409, 'CREDIT_NOT_PAYABLE', 'Selected notes are no longer payable');
      const lines = await transaction
        .selectFrom('sale_line')
        .selectAll()
        .where('sale_id', 'in', input.saleIds)
        .orderBy('sale_id')
        .orderBy('sequence')
        .execute();
      const id = randomUUID();
      const counter = await sql<{
        value: string;
      }>`update credit_payment_counter set value = value + 1 where id = 1 returning value::text`.execute(
        transaction,
      );
      const receiptNumber = `Pago: ${counter.rows[0]!.value.padStart(3, '0')}`;
      const total = sumMoney(notes.map((n) => n.total));
      const snapshot = {
        ticketNumber: receiptNumber,
        saleNumber: notes.map((n) => n.sale_number).join(', '),
        customerName: customer.display_name,
        currencyCode: 'USD',
        paymentMethod: input.paymentMethod,
        total,
        lines: lines.map((line) => ({
          productName: `${notes.find((n) => n.id === line.sale_id)!.sale_number} - ${line.product_name}`,
          unitCode: line.unit_code,
          quantity: line.quantity,
          unitPrice: line.unit_price,
          lineAmount: line.line_amount,
        })),
      };
      const payment = await transaction
        .insertInto('credit_payment')
        .values({
          id,
          customer_id: customerId,
          receipt_number: receiptNumber,
          total,
          currency_code: 'USD',
          payment_method: input.paymentMethod,
          created_by: context.actorId,
          idempotency_request_id: acquired.id,
          snapshot,
        })
        .returning('created_at')
        .executeTakeFirstOrThrow();
      await transaction
        .insertInto('credit_payment_sale')
        .values(
          notes.map((n) => ({
            sale_id: n.id,
            payment_id: id,
            amount: n.total,
          })),
        )
        .execute();
      const result = {
        id,
        receiptNumber,
        customerId,
        total,
        currencyCode: 'USD',
        createdAt: payment.created_at.toISOString(),
        snapshot,
      };
      await new AuditWriter().write(transaction, {
        actorId: context.actorId,
        action: 'CREDIT_PAID',
        entityType: 'CREDIT_PAYMENT',
        entityId: id,
        requestId: context.requestId,
        after: { saleIds: input.saleIds, total, paymentMethod: input.paymentMethod },
      });
      await idempotency.complete(transaction, acquired.id, {
        resourceType: 'CREDIT_PAYMENT',
        resourceId: id,
        status: 201,
        body: result,
      });
      return result;
    });
  }
}

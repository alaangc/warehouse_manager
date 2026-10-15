import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency-repository.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';
import { parseExactDecimal, sumMoney } from '../../shared/money.js';
import type { SaleContext } from './sale-service.js';

export const CreditPaymentSchema = z
  .object({
    saleIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK']),
    amount: z
      .string()
      .regex(/^(0|[1-9]\d{0,16})\.\d{2}$/)
      .refine((v) => parseExactDecimal(v).gt(0))
      .optional(),
  })
  .strict()
  .refine((input) => input.amount === undefined || input.saleIds.length === 1);

export class CreditService {
  constructor(private readonly database: AppDatabase) {}

  async list(customerId: string) {
    const notes = await this.database
      .selectFrom('sale as s')
      .select([
        's.id',
        's.sale_number as saleNumber',
        sql<string>`(s.total - coalesce((select sum(p.amount) from credit_payment_sale p where p.sale_id = s.id), 0))::numeric(19,2)::text`.as(
          'total',
        ),
        's.currency_code as currencyCode',
        's.completed_at as completedAt',
      ])
      .where('s.customer_id', '=', customerId)
      .where('s.payment_method', '=', 'CREDIT')
      .where('s.status', '=', 'COMPLETED')
      .where(
        sql<boolean>`s.total > coalesce((select sum(p.amount) from credit_payment_sale p where p.sale_id = s.id), 0)`,
      )
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
          paymentMethod: input.paymentMethod,
          ...(input.amount === undefined ? {} : { amount: input.amount }),
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
      // Serialize payments and cancellation on the same notes in a stable order.
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
        .select(['sale_id', 'amount'])
        .where('sale_id', 'in', input.saleIds)
        .execute();
      if (
        notes.length !== input.saleIds.length ||
        notes.some(
          (n) =>
            n.payment_method !== 'CREDIT' || n.status !== 'COMPLETED' || n.currency_code !== 'USD',
        )
      )
        throw new HttpProblem(409, 'CREDIT_NOT_PAYABLE', 'Selected notes are no longer payable');
      const allocations = notes.map((note) => {
        const balance = parseExactDecimal(note.total).minus(
          sumMoney(paid.filter((p) => p.sale_id === note.id).map((p) => p.amount)),
        );
        const amount = input.amount === undefined ? balance : parseExactDecimal(input.amount);
        if (balance.lte(0) || amount.gt(balance))
          throw new HttpProblem(
            409,
            'CREDIT_NOT_PAYABLE',
            'Payment exceeds the outstanding balance',
          );
        return {
          sale_id: note.id,
          amount: amount.toFixed(2),
          balance: balance.minus(amount).toFixed(2),
        };
      });
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
      const total = sumMoney(allocations.map((n) => n.amount));
      const snapshot = {
        ticketNumber: receiptNumber,
        saleNumber: notes.map((n) => n.sale_number).join(', '),
        customerName: customer.display_name,
        currencyCode: 'USD',
        paymentMethod: input.paymentMethod,
        total,
        lines:
          allocations.some((a) => a.balance !== '0.00') || paid.length
            ? allocations.map((a) => ({
                productName: `${notes.find((n) => n.id === a.sale_id)!.sale_number} - Pago / Payment; saldo / balance USD ${a.balance}`,
                unitCode: 'PZA',
                quantity: '1.000',
                unitPrice: a.amount,
                lineAmount: a.amount,
              }))
            : lines.map((line) => ({
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
          allocations.map((n) => ({
            sale_id: n.sale_id,
            payment_id: id,
            amount: n.amount,
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

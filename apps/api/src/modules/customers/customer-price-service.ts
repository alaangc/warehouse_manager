import type { AppDatabase } from '../../db/database.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';

export class CustomerPriceService {
  constructor(private readonly database: AppDatabase) {}
  create(
    customerId: string,
    input: {
      productId: string;
      unitPrice: string;
      validFrom: string;
      validTo?: string | null | undefined;
    },
    actorId: string,
    requestId: string,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      const [customer, product] = await Promise.all([
        transaction
          .selectFrom('customer')
          .select('id')
          .where('id', '=', customerId)
          .where('active', '=', true)
          .executeTakeFirst(),
        transaction
          .selectFrom('product')
          .select('id')
          .where('id', '=', input.productId)
          .where('active', '=', true)
          .executeTakeFirst(),
      ]);
      if (!customer || !product)
        throw Object.assign(new Error('Customer and product must both be active'), {
          code: 'RESOURCE_NOT_FOUND',
        });
      const row = await transaction
        .insertInto('customer_price')
        .values({
          customer_id: customerId,
          product_id: input.productId,
          unit_price: input.unitPrice,
          valid_from: new Date(input.validFrom),
          valid_to: input.validTo ? new Date(input.validTo) : null,
          created_by: actorId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await new AuditWriter().write(transaction, {
        actorId,
        action: 'CATALOG_CHANGED',
        entityType: 'CUSTOMER_PRICE',
        entityId: row.id,
        after: { customerId, productId: input.productId, unitPrice: input.unitPrice },
        requestId,
      });
      return row;
    });
  }
  deactivate(id: string, reason: string, actorId: string, requestId: string) {
    return this.database.transaction().execute(async (transaction) => {
      const before = await transaction
        .selectFrom('customer_price')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!before || !before.active)
        throw Object.assign(new Error('Price is already inactive or missing'), {
          code: 'RESOURCE_NOT_FOUND',
        });
      const row = await transaction
        .updateTable('customer_price')
        .set({ active: false })
        .where('id', '=', id)
        .where('active', '=', true)
        .returningAll()
        .executeTakeFirst();
      if (!row)
        throw Object.assign(new Error('Price is already inactive or missing'), {
          code: 'RESOURCE_NOT_FOUND',
        });
      await new AuditWriter().write(transaction, {
        actorId,
        action: 'CATALOG_CHANGED',
        entityType: 'CUSTOMER_PRICE',
        entityId: id,
        reason,
        before: { active: true, unitPrice: before.unit_price },
        after: { active: false },
        requestId,
      });
      return row;
    });
  }
}

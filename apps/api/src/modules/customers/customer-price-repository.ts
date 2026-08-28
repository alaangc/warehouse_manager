import type { Transaction } from 'kysely';
import type { Database } from '../../db/types.js';

export class CustomerPriceRepository {
  constructor(private readonly database: Transaction<Database>) {}

  findEffective(customerId: string, productId: string, at: Date) {
    return this.database
      .selectFrom('customer_price')
      .selectAll()
      .where('customer_id', '=', customerId)
      .where('product_id', '=', productId)
      .where('active', '=', true)
      .where('valid_from', '<=', at)
      .where((eb) => eb.or([eb('valid_to', 'is', null), eb('valid_to', '>', at)]))
      .orderBy('valid_from desc')
      .executeTakeFirst();
  }
}

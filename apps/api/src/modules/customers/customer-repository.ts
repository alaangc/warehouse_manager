import type { Selectable, Transaction } from 'kysely';
import type { CustomerTable, Database } from '../../db/types.js';

export function toCustomerResource(
  row: Selectable<CustomerTable>,
  role: 'ADMINISTRATOR' | 'DRIVER',
) {
  const shared = {
    id: row.id,
    customerNumber: row.customer_number,
    displayName: row.display_name,
    city: row.city,
    active: row.active,
    version: row.version,
  };
  return role === 'DRIVER'
    ? shared
    : {
        ...shared,
        contactName: row.contact_name,
        phone: row.phone,
        email: row.email,
        address: row.address,
        notes: row.notes,
      };
}

export class CustomerRepository {
  constructor(private readonly database: Transaction<Database>) {}
  list(search?: string, active?: boolean) {
    let query = this.database.selectFrom('customer').selectAll().orderBy('display_name').limit(100);
    if (search?.trim())
      query = query.where((eb) =>
        eb.or([
          eb('display_name', 'ilike', `%${search.trim()}%`),
          eb('customer_number', 'ilike', `%${search.trim()}%`),
        ]),
      );
    if (active !== undefined) query = query.where('active', '=', active);
    return query.execute();
  }
  detail(customerId: string, activeOnly = false) {
    let query = this.database.selectFrom('customer').selectAll().where('id', '=', customerId);
    if (activeOnly) query = query.where('active', '=', true);
    return query.executeTakeFirst();
  }
  history(customerId: string) {
    return this.database
      .selectFrom('sale')
      .selectAll()
      .where('customer_id', '=', customerId)
      .orderBy('completed_at desc')
      .limit(100)
      .execute();
  }
}

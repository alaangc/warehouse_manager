import type { Transaction } from 'kysely';
import type { Database } from '../../db/types.js';

export class SaleRepository {
  constructor(private readonly database: Transaction<Database>) {}

  list(principal: { id: string; role: 'ADMINISTRATOR' | 'DRIVER' }) {
    let query = this.database
      .selectFrom('sale')
      .selectAll()
      .orderBy('completed_at desc')
      .limit(100);
    if (principal.role === 'DRIVER') query = query.where('driver_id', '=', principal.id);
    return query.execute();
  }

  async detail(id: string, principal: { id: string; role: 'ADMINISTRATOR' | 'DRIVER' }) {
    let query = this.database
      .selectFrom('sale')
      .innerJoin('sale_ticket', 'sale_ticket.sale_id', 'sale.id')
      .selectAll('sale')
      .select('sale_ticket.ticket_number')
      .where('sale.id', '=', id);
    if (principal.role === 'DRIVER') query = query.where('sale.driver_id', '=', principal.id);
    const sale = await query.executeTakeFirst();
    if (!sale) return null;
    const lines = await this.database
      .selectFrom('sale_line')
      .selectAll()
      .where('sale_id', '=', id)
      .orderBy('sequence')
      .execute();
    return { ...sale, lines };
  }
}

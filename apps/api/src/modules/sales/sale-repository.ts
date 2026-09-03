import type { Transaction } from 'kysely';
import type { Database } from '../../db/types.js';

export interface SaleListFilters {
  customerId?: string;
  driverId?: string;
  routeId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

function summary(row: {
  id: string;
  sale_number: string;
  status: 'COMPLETED' | 'CANCELLED';
  customer_id: string;
  driver_id: string;
  route_id: string;
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'CARD';
  total: string;
  completed_at: Date;
  cancelled_at: Date | null;
}) {
  return {
    id: row.id,
    saleNumber: row.sale_number,
    status: row.status,
    customerId: row.customer_id,
    driverId: row.driver_id,
    routeId: row.route_id,
    paymentMethod: row.payment_method,
    total: row.total,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
  };
}

export class SaleRepository {
  constructor(private readonly database: Transaction<Database>) {}

  async list(
    principal: { id: string; role: 'ADMINISTRATOR' | 'DRIVER' },
    filters: SaleListFilters = {},
  ) {
    let query = this.database
      .selectFrom('sale')
      .selectAll()
      .orderBy('completed_at', 'desc')
      .orderBy('id', 'desc')
      .limit(filters.limit ?? 25);
    if (principal.role === 'DRIVER') query = query.where('driver_id', '=', principal.id);
    if (filters.driverId) query = query.where('driver_id', '=', filters.driverId);
    if (filters.customerId) query = query.where('customer_id', '=', filters.customerId);
    if (filters.routeId) query = query.where('route_id', '=', filters.routeId);
    if (filters.from) query = query.where('completed_at', '>=', filters.from);
    if (filters.to) query = query.where('completed_at', '<', filters.to);
    return (await query.execute()).map(summary);
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
    if (!sale) {
      if (principal.role === 'DRIVER') {
        const exists = await this.database
          .selectFrom('sale')
          .select('id')
          .where('id', '=', id)
          .executeTakeFirst();
        if (exists)
          throw Object.assign(new Error('Sale belongs to another Driver'), {
            code: 'SALE_FORBIDDEN',
          });
      }
      return null;
    }
    const lines = await this.database
      .selectFrom('sale_line')
      .selectAll()
      .where('sale_id', '=', id)
      .orderBy('sequence')
      .execute();
    return {
      id: sale.id,
      saleNumber: sale.sale_number,
      clientOperationId: sale.client_operation_id,
      status: sale.status,
      customerId: sale.customer_id,
      driverId: sale.driver_id,
      routeId: sale.route_id,
      originLocationId: sale.origin_location_id,
      paymentMethod: sale.payment_method,
      currencyCode: sale.currency_code,
      subtotal: sale.subtotal,
      total: sale.total,
      roundingMode: sale.rounding_mode,
      ticketNumber: sale.ticket_number,
      completedAt: sale.completed_at,
      cancelledAt: sale.cancelled_at,
      cancelledBy: sale.cancelled_by,
      cancellationReason: sale.cancellation_reason,
      lines: lines.map((line) => ({
        sequence: line.sequence,
        productId: line.product_id,
        productName: line.product_name,
        categoryName: line.category_name,
        reportingGroup: line.reporting_group,
        unitCode: line.unit_code,
        quantity: line.quantity,
        appliedPriceSource: line.applied_price_source,
        unitPrice: line.unit_price,
        lineAmount: line.line_amount,
      })),
    };
  }
}

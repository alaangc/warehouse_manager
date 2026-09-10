import { sql } from 'kysely';
import type { AppDatabase } from '../../db/database.js';
import { composeRoleOverview, type UserSummary } from '../users/user-domain.js';

export class OverviewService {
  constructor(private readonly database: AppDatabase) {}

  get(principal: Pick<UserSummary, 'id' | 'role'>) {
    // Routes and aggregates describe one database snapshot, even during sales/cancellations.
    return this.database
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (transaction) => {
        let query = transaction
          .selectFrom('route')
          .select(['id', 'driver_id as driverId', 'state'])
          .where('state', '!=', 'CLOSED')
          .orderBy('id');
        if (principal.role === 'DRIVER') query = query.where('driver_id', '=', principal.id);
        const routes = await query.execute();
        if (principal.role === 'DRIVER') return composeRoleOverview(principal, { routes });

        // PostgreSQL numeric performs the sum without binary floating-point conversion.
        const sales = await sql<{ grossTotal: string }>`
        select coalesce(sum(total), 0.00)::text as "grossTotal"
        from sale where status = 'COMPLETED'
      `.execute(transaction);
        // A missing balance is zero. Count each active product/branch pair once,
        // not route stock, archived products or retired branches.
        const alerts = await sql<{ lowStockCount: string }>`
        select count(*)::text as "lowStockCount"
        from product
        cross join location
        join stock_location on stock_location.branch_id = location.id
          and stock_location.kind = 'BRANCH'
        left join inventory_balance on inventory_balance.product_id = product.id
          and inventory_balance.stock_location_id = stock_location.id
        where product.active and location.active
          and coalesce(inventory_balance.quantity, 0) <= product.low_stock_threshold
      `.execute(transaction);
        return composeRoleOverview(principal, {
          routes,
          grossTotal: sales.rows[0]!.grossTotal,
          lowStockCount: Number(alerts.rows[0]!.lowStockCount),
        });
      });
  }
}

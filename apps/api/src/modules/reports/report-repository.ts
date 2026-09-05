import { sql, type Kysely } from 'kysely';
import type { Database, JsonValue, ReportType, ReportingGroup } from '../../db/types.js';
import type { ResolvedReportingPeriod } from './reporting-period.js';

type PeriodBounds = Pick<ResolvedReportingPeriod, 'periodStart' | 'periodEnd'>;

export interface SalesByDriverRow {
  driverId: string;
  driverName: string;
  saleCount: string;
  total: string;
}

export interface BestSellingProductRow {
  productId: string;
  productName: string;
  quantity: string;
  total: string;
}

export interface FinancialGroupRow {
  reportingGroup: ReportingGroup;
  total: string;
}

export interface InventoryByBranchRow {
  branchId: string;
  branchCode: string;
  branchName: string;
  productId: string;
  productName: string;
  unitCode: string;
  quantity: string;
}

export interface ContributingSaleRow {
  saleId: string;
  includedAmount: string;
}

export interface ReportSnapshotInsert {
  reportType: ReportType;
  filters: JsonValue;
  businessTimezone: string;
  sourceWatermark: string;
  result: JsonValue;
  createdBy: string;
  idempotencyRequestId: string;
}

export class ReportRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async salesByDriver(period: PeriodBounds): Promise<SalesByDriverRow[]> {
    const result = await sql<SalesByDriverRow>`
      select
        app_user.id as "driverId",
        app_user.display_name as "driverName",
        count(sale.id)::text as "saleCount",
        coalesce(sum(sale.total), 0)::numeric(19,2)::text as total
      from sale
      join app_user on app_user.id = sale.driver_id
      where sale.status = 'COMPLETED'
        and sale.completed_at >= ${new Date(period.periodStart)}
        and sale.completed_at < ${new Date(period.periodEnd)}
      group by app_user.id, app_user.display_name
      order by sum(sale.total) desc, app_user.display_name, app_user.id
    `.execute(this.database);
    return result.rows;
  }

  async bestSellingProducts(period: PeriodBounds): Promise<BestSellingProductRow[]> {
    const result = await sql<BestSellingProductRow>`
      select
        sale_line.product_id as "productId",
        min(sale_line.product_name) as "productName",
        sum(sale_line.quantity)::numeric(18,3)::text as quantity,
        sum(sale_line.line_amount)::numeric(19,2)::text as total
      from sale_line
      join sale on sale.id = sale_line.sale_id
      where sale.status = 'COMPLETED'
        and sale.completed_at >= ${new Date(period.periodStart)}
        and sale.completed_at < ${new Date(period.periodEnd)}
      group by sale_line.product_id
      order by sum(sale_line.quantity) desc, min(sale_line.product_name), sale_line.product_id
    `.execute(this.database);
    return result.rows;
  }

  async financialGroups(period: PeriodBounds): Promise<FinancialGroupRow[]> {
    const result = await sql<FinancialGroupRow>`
      select
        sale_line.reporting_group as "reportingGroup",
        sum(sale_line.line_amount)::numeric(19,2)::text as total
      from sale_line
      join sale on sale.id = sale_line.sale_id
      where sale.status = 'COMPLETED'
        and sale.completed_at >= ${new Date(period.periodStart)}
        and sale.completed_at < ${new Date(period.periodEnd)}
      group by sale_line.reporting_group
      order by array_position(
        array['SODAS','CHARCOAL','TOSTADAS','OTHER']::text[],
        sale_line.reporting_group
      )
    `.execute(this.database);
    return result.rows;
  }

  async inventoryByBranch(): Promise<InventoryByBranchRow[]> {
    const result = await sql<InventoryByBranchRow>`
      select
        location.id as "branchId",
        location.code as "branchCode",
        location.name as "branchName",
        product.id as "productId",
        product.name as "productName",
        unit.code as "unitCode",
        inventory_balance.quantity::numeric(18,3)::text as quantity
      from inventory_balance
      join stock_location on stock_location.id = inventory_balance.stock_location_id
      join location on location.id = stock_location.branch_id
      join product on product.id = inventory_balance.product_id
      join unit on unit.id = product.unit_id
      where stock_location.kind = 'BRANCH'
      order by location.name, location.id, product.name, product.id
    `.execute(this.database);
    return result.rows;
  }

  async contributingSales(period: PeriodBounds): Promise<ContributingSaleRow[]> {
    const result = await sql<ContributingSaleRow>`
      select sale.id as "saleId", sale.total::numeric(19,2)::text as "includedAmount"
      from sale
      where sale.status = 'COMPLETED'
        and sale.completed_at >= ${new Date(period.periodStart)}
        and sale.completed_at < ${new Date(period.periodEnd)}
      order by sale.completed_at, sale.id
    `.execute(this.database);
    return result.rows;
  }

  async saleSourceWatermark(period: PeriodBounds): Promise<string> {
    const result = await sql<{ watermark: string }>`
      select encode(
        digest(
          coalesce(
            string_agg(
              concat_ws(':', sale.id::text, sale.status, sale.total::text, sale.completed_at::text),
              '|' order by sale.id
            ),
            ''
          ),
          'sha256'
        ),
        'hex'
      ) as watermark
      from sale
      where sale.completed_at >= ${new Date(period.periodStart)}
        and sale.completed_at < ${new Date(period.periodEnd)}
    `.execute(this.database);
    return result.rows[0]!.watermark;
  }

  async inventorySourceWatermark(): Promise<string> {
    const result = await sql<{ watermark: string }>`
      select encode(
        digest(
          coalesce(
            string_agg(
              concat_ws(
                ':', inventory_balance.stock_location_id::text,
                inventory_balance.product_id::text, inventory_balance.quantity::text,
                inventory_balance.version::text
              ),
              '|' order by inventory_balance.stock_location_id, inventory_balance.product_id
            ),
            ''
          ),
          'sha256'
        ),
        'hex'
      ) as watermark
      from inventory_balance
      join stock_location on stock_location.id = inventory_balance.stock_location_id
      where stock_location.kind = 'BRANCH'
    `.execute(this.database);
    return result.rows[0]!.watermark;
  }

  insertSnapshot(input: ReportSnapshotInsert) {
    return this.database
      .insertInto('report_snapshot')
      .values({
        report_type: input.reportType,
        filters: input.filters,
        business_timezone: input.businessTimezone,
        source_watermark: input.sourceWatermark,
        result: input.result,
        created_by: input.createdBy,
        idempotency_request_id: input.idempotencyRequestId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}

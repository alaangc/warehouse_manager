import type { Transaction } from 'kysely';
import type { Database } from '../../db/types.js';
import {
  calculateLineAmount,
  canonicalDecimal,
  parseExactDecimal,
  sumMoney,
} from '../../shared/money.js';
import { parseQuantity } from '../../shared/quantity.js';
import { CustomerPriceRepository } from '../customers/customer-price-repository.js';

export interface PricedLine {
  productId: string;
  productName: string;
  categoryName: string;
  reportingGroup: 'SODAS' | 'CHARCOAL' | 'TOSTADAS' | 'OTHER';
  unitCode: string;
  quantity: string;
  appliedPriceSource: 'CUSTOMER' | 'STANDARD';
  customerPriceId: string | null;
  unitPrice: string;
  lineAmount: string;
  availableQuantity: string;
  available: boolean;
}

export function calculatePricedLine(unitPrice: string, quantity: string) {
  return {
    unitPrice: canonicalDecimal(unitPrice, 4),
    lineAmount: calculateLineAmount(unitPrice, quantity),
  };
}

export class PricingService {
  constructor(private readonly transaction: Transaction<Database>) {}

  async price(
    customerId: string,
    routeId: string,
    requests: { productId: string; quantity: string }[],
    at = new Date(),
  ) {
    const customer = await this.transaction
      .selectFrom('customer')
      .select('id')
      .where('id', '=', customerId)
      .where('active', '=', true)
      .executeTakeFirst();
    if (!customer)
      throw Object.assign(new Error('An active registered customer is required'), {
        code: 'CUSTOMER_UNAVAILABLE',
      });
    const route = await this.transaction
      .selectFrom('route')
      .innerJoin('stock_location', 'stock_location.route_id', 'route.id')
      .select(['route.id', 'route.state', 'stock_location.id as stockLocationId'])
      .where('route.id', '=', routeId)
      .executeTakeFirst();
    if (!route || route.state !== 'EN_ROUTE')
      throw Object.assign(new Error('Route is not available for sales'), {
        code: 'ROUTE_NOT_EN_ROUTE',
      });
    const priceRepository = new CustomerPriceRepository(this.transaction);
    const lines: PricedLine[] = [];
    for (const request of requests) {
      const product = await this.transaction
        .selectFrom('product')
        .innerJoin('category', 'category.id', 'product.category_id')
        .innerJoin('unit', 'unit.id', 'product.unit_id')
        .leftJoin('inventory_balance', (join) =>
          join
            .onRef('inventory_balance.product_id', '=', 'product.id')
            .on('inventory_balance.stock_location_id', '=', route.stockLocationId),
        )
        .select([
          'product.id',
          'product.name',
          'product.standard_unit_price',
          'category.name as categoryName',
          'category.reporting_group',
          'unit.code as unitCode',
          'unit.quantity_scale',
          'inventory_balance.quantity as availableQuantity',
        ])
        .where('product.id', '=', request.productId)
        .where('product.active', '=', true)
        .executeTakeFirst();
      if (!product)
        throw Object.assign(new Error('Product is not active'), { code: 'PRODUCT_UNAVAILABLE' });
      const quantity = parseQuantity(request.quantity, product.quantity_scale);
      const special = await priceRepository.findEffective(customerId, request.productId, at);
      const calculation = calculatePricedLine(
        special?.unit_price ?? product.standard_unit_price,
        quantity,
      );
      const availableQuantity = canonicalDecimal(product.availableQuantity ?? '0', 3);
      lines.push({
        productId: product.id,
        productName: product.name,
        categoryName: product.categoryName,
        reportingGroup: product.reporting_group,
        unitCode: product.unitCode,
        quantity,
        appliedPriceSource: special ? 'CUSTOMER' : 'STANDARD',
        customerPriceId: special?.id ?? null,
        ...calculation,
        availableQuantity,
        available: parseExactDecimal(availableQuantity).greaterThanOrEqualTo(
          parseExactDecimal(quantity),
        ),
      });
    }
    return {
      customerId,
      routeId,
      currencyCode: 'MXN',
      lines,
      total: sumMoney(lines.map((line) => line.lineAmount)),
      quotedAt: at.toISOString(),
    };
  }
}

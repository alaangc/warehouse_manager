import type { Transaction } from 'kysely';
import { SaleCreateRequestSchema } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../../src/db/types.js';
import { calculatePricedLine, PricingService } from '../../../src/modules/sales/pricing-service.js';

type Comparison = {
  kind: 'comparison';
  column: string;
  operator: '=' | '<=' | '>' | 'is';
  value: unknown;
};
type Predicate = Comparison | { kind: 'or'; predicates: Predicate[] };

interface ProductFixture {
  id: string;
  name: string;
  standard_unit_price: string;
  categoryName: string;
  reporting_group: 'SODAS' | 'CHARCOAL' | 'TOSTADAS' | 'OTHER';
  unitCode: string;
  quantity_scale: number;
  availableQuantity: string;
  active: boolean;
}

interface CustomerPriceFixture {
  id: string;
  customer_id: string;
  product_id: string;
  unit_price: string;
  valid_from: Date;
  valid_to: Date | null;
  active: boolean;
}

interface PricingFixture {
  customerId: string;
  routeId: string;
  customerActive?: boolean;
  routeState?: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';
  products: ProductFixture[];
  customerPrices?: CustomerPriceFixture[];
}

function compare(left: unknown, operator: Comparison['operator'], right: unknown): boolean {
  if (operator === 'is') return left === right;
  if (operator === '=') return left === right;
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;
  if (typeof leftValue !== 'number' || typeof rightValue !== 'number') return false;
  return operator === '<=' ? leftValue <= rightValue : leftValue > rightValue;
}

function valueAt(row: Record<string, unknown>, column: string): unknown {
  return row[column.includes('.') ? column.slice(column.lastIndexOf('.') + 1) : column];
}

function matches(row: Record<string, unknown>, predicate: Predicate): boolean {
  if (predicate.kind === 'or') return predicate.predicates.some((entry) => matches(row, entry));
  return compare(valueAt(row, predicate.column), predicate.operator, predicate.value);
}

function pricingTransaction(fixture: PricingFixture): Transaction<Database> {
  return {
    selectFrom(table: string) {
      const predicates: Predicate[] = [];
      const expression = Object.assign(
        (column: string, operator: Comparison['operator'], value: unknown): Predicate => ({
          kind: 'comparison',
          column,
          operator,
          value,
        }),
        {
          or: (entries: Predicate[]): Predicate => ({ kind: 'or', predicates: entries }),
        },
      );
      const join = {
        onRef: () => join,
        on: () => join,
      };
      const query = {
        innerJoin: () => query,
        leftJoin: (
          _joinedTable: string,
          callback: ((builder: typeof join) => unknown) | string,
        ) => {
          if (typeof callback === 'function') callback(join);
          return query;
        },
        select: () => query,
        selectAll: () => query,
        orderBy: () => query,
        where: (
          columnOrCallback: string | ((builder: typeof expression) => Predicate),
          operator?: Comparison['operator'],
          value?: unknown,
        ) => {
          predicates.push(
            typeof columnOrCallback === 'function'
              ? columnOrCallback(expression)
              : {
                  kind: 'comparison',
                  column: columnOrCallback,
                  operator: operator ?? '=',
                  value,
                },
          );
          return query;
        },
        async executeTakeFirst() {
          if (table === 'customer') {
            const row = { id: fixture.customerId, active: fixture.customerActive ?? true };
            return predicates.every((predicate) => matches(row, predicate)) ? row : undefined;
          }
          if (table === 'route') {
            const row = {
              id: fixture.routeId,
              state: fixture.routeState ?? 'EN_ROUTE',
              stockLocationId: 'route-stock-location',
            };
            return predicates.every((predicate) => matches(row, predicate)) ? row : undefined;
          }
          if (table === 'product') {
            return fixture.products.find((row) =>
              predicates.every((predicate) => matches(row, predicate)),
            );
          }
          if (table === 'customer_price') {
            return [...(fixture.customerPrices ?? [])]
              .filter((row) => predicates.every((predicate) => matches(row, predicate)))
              .sort((left, right) => right.valid_from.getTime() - left.valid_from.getTime())[0];
          }
          return undefined;
        },
      };
      return query;
    },
  } as unknown as Transaction<Database>;
}

const customerId = '11111111-1111-4111-8111-111111111111';
const routeId = '22222222-2222-4222-8222-222222222222';
const sodaId = '33333333-3333-4333-8333-333333333333';
const charcoalId = '44444444-4444-4444-8444-444444444444';

function soda(overrides: Partial<ProductFixture> = {}): ProductFixture {
  return {
    id: sodaId,
    name: 'Cola 600 ml',
    standard_unit_price: '12.3456',
    categoryName: 'Soft drinks',
    reporting_group: 'SODAS',
    unitCode: 'BOTTLE',
    quantity_scale: 3,
    availableQuantity: '100.000',
    active: true,
    ...overrides,
  };
}

describe('sale pricing', () => {
  it('uses exact four-decimal unit prices and rounds each line half away from zero', () => {
    expect(calculatePricedLine('1.0050', '1')).toEqual({ unitPrice: '1.0050', lineAmount: '1.01' });
    expect(calculatePricedLine('12.3456', '2.500')).toEqual({
      unitPrice: '12.3456',
      lineAmount: '30.86',
    });
  });

  it('does not accept binary floating-point or malformed decimal inputs', () => {
    expect(() => calculatePricedLine('1e2', '1')).toThrow();
    expect(() => calculatePricedLine('NaN', '1')).toThrow();
  });

  it('gives an active customer price precedence throughout its half-open interval', async () => {
    const validFrom = new Date('2026-08-01T00:00:00.000Z');
    const validTo = new Date('2026-09-01T00:00:00.000Z');
    const fixture: PricingFixture = {
      customerId,
      routeId,
      products: [soda()],
      customerPrices: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          customer_id: customerId,
          product_id: sodaId,
          unit_price: '10.5000',
          valid_from: validFrom,
          valid_to: validTo,
          active: true,
        },
      ],
    };

    const atStart = await new PricingService(pricingTransaction(fixture)).price(
      customerId,
      routeId,
      [{ productId: sodaId, quantity: '2' }],
      validFrom,
    );
    const beforeEnd = await new PricingService(pricingTransaction(fixture)).price(
      customerId,
      routeId,
      [{ productId: sodaId, quantity: '2' }],
      new Date(validTo.getTime() - 1),
    );
    const atEnd = await new PricingService(pricingTransaction(fixture)).price(
      customerId,
      routeId,
      [{ productId: sodaId, quantity: '2' }],
      validTo,
    );

    expect(atStart.lines[0]).toMatchObject({
      appliedPriceSource: 'CUSTOMER',
      customerPriceId: fixture.customerPrices?.[0]?.id,
      unitPrice: '10.5000',
    });
    expect(beforeEnd.lines[0]?.appliedPriceSource).toBe('CUSTOMER');
    expect(atEnd.lines[0]).toMatchObject({
      appliedPriceSource: 'STANDARD',
      customerPriceId: null,
      unitPrice: '12.3456',
    });
  });

  it('returns immutable catalog snapshots and sums rounded multiline amounts', async () => {
    const fixture: PricingFixture = {
      customerId,
      routeId,
      products: [
        soda(),
        {
          id: charcoalId,
          name: 'Mesquite charcoal',
          standard_unit_price: '1.0050',
          categoryName: 'Charcoal',
          reporting_group: 'CHARCOAL',
          unitCode: 'BAG',
          quantity_scale: 0,
          availableQuantity: '10.000',
          active: true,
        },
      ],
    };

    const quote = await new PricingService(pricingTransaction(fixture)).price(
      customerId,
      routeId,
      [
        { productId: sodaId, quantity: '2.500' },
        { productId: charcoalId, quantity: '1' },
      ],
      new Date('2026-08-15T12:00:00.000Z'),
    );

    expect(quote.lines[0]).toMatchObject({
      productName: 'Cola 600 ml',
      categoryName: 'Soft drinks',
      reportingGroup: 'SODAS',
      unitCode: 'BOTTLE',
      quantity: '2.500',
      unitPrice: '12.3456',
      lineAmount: '30.86',
    });
    expect(quote.lines[1]).toMatchObject({
      productName: 'Mesquite charcoal',
      categoryName: 'Charcoal',
      reportingGroup: 'CHARCOAL',
      unitCode: 'BAG',
      quantity: '1',
      lineAmount: '1.01',
    });
    expect(quote.total).toBe('31.87');
  });

  it('compares high-precision inventory quantities without converting them to numbers', async () => {
    const fixture: PricingFixture = {
      customerId,
      routeId,
      products: [soda({ availableQuantity: '999999999999999.998' })],
    };

    const quote = await new PricingService(pricingTransaction(fixture)).price(customerId, routeId, [
      { productId: sodaId, quantity: '999999999999999.999' },
    ]);

    expect(quote.lines[0]).toMatchObject({
      availableQuantity: '999999999999999.998',
      available: false,
    });
  });

  it.each(['CASH', 'BANK_TRANSFER', 'CARD'] as const)(
    'preserves the %s payment method through request validation',
    (paymentMethod) => {
      const parsed = SaleCreateRequestSchema.parse({
        clientOperationId: '66666666-6666-4666-8666-666666666666',
        customerId,
        routeId,
        paymentMethod,
        lines: [{ productId: sodaId, quantity: '1' }],
      });

      expect(parsed.paymentMethod).toBe(paymentMethod);
    },
  );
});

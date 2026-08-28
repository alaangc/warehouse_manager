import {
  SaleCancellationRequestSchema,
  SaleCreateRequestSchema,
  SaleQuoteRequestSchema,
} from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';

describe('sales request contracts', () => {
  const line = { productId: crypto.randomUUID(), quantity: '1.500' };
  it('requires a registered customer, route, exact quantities, and payment method', () => {
    const request = {
      clientOperationId: crypto.randomUUID(),
      customerId: crypto.randomUUID(),
      routeId: crypto.randomUUID(),
      paymentMethod: 'CASH',
      lines: [line],
    };
    expect(SaleCreateRequestSchema.parse(request)).toEqual(request);
    expect(() => SaleCreateRequestSchema.parse({ ...request, paymentMethod: 'CREDIT' })).toThrow();
    expect(() =>
      SaleCreateRequestSchema.parse({ ...request, lines: [{ ...line, quantity: 1.5 }] }),
    ).toThrow();
  });
  it('keeps quotes advisory and requires a cancellation reason', () => {
    expect(
      SaleQuoteRequestSchema.safeParse({
        customerId: crypto.randomUUID(),
        routeId: crypto.randomUUID(),
        lines: [line],
      }).success,
    ).toBe(true);
    expect(() => SaleCancellationRequestSchema.parse({ reason: ' ' })).toThrow();
  });
});

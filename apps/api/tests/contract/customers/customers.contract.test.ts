import {
  CustomerPriceDeactivateSchema,
  CustomerPriceWriteSchema,
  CustomerUpdateSchema,
  CustomerWriteSchema,
} from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';

describe('customer contracts', () => {
  it('validates customer creation and optimistic archival', () => {
    expect(CustomerWriteSchema.parse({ displayName: 'Customer', city: 'Caborca' })).toEqual({
      displayName: 'Customer',
      city: 'Caborca',
    });
    expect(() =>
      CustomerUpdateSchema.parse({
        expectedVersion: 1,
        displayName: '',
        city: 'Caborca',
        active: false,
      }),
    ).toThrow();
  });

  it('keeps exact prices and ordered validity intervals', () => {
    const validFrom = new Date().toISOString();
    expect(
      CustomerPriceWriteSchema.parse({
        productId: crypto.randomUUID(),
        unitPrice: '12.3456',
        validFrom,
      }),
    ).toMatchObject({ unitPrice: '12.3456' });
    expect(() =>
      CustomerPriceWriteSchema.parse({
        productId: crypto.randomUUID(),
        unitPrice: 12.3456,
        validFrom,
      }),
    ).toThrow();
    expect(() => CustomerPriceDeactivateSchema.parse({ reason: ' ' })).toThrow();
  });
});

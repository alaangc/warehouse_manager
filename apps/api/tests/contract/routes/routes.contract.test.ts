import {
  RouteCreateSchema,
  RouteLoadDraftSchema,
  RouteReconciliationSchema,
  RouteTransitionSchema,
} from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';

describe('route command contracts', () => {
  it('accepts an administrator assignment while allowing the server to number the route', () => {
    const request = {
      originLocationId: crypto.randomUUID(),
      driverId: crypto.randomUUID(),
      vehicleId: crypto.randomUUID(),
      businessDate: '2026-08-27',
    };
    expect(RouteCreateSchema.parse(request)).toEqual(request);
    expect(() => RouteCreateSchema.parse({ ...request, businessDate: '27/08/2026' })).toThrow();
  });

  it('requires exact quantities and optimistic versions for load and transitions', () => {
    const productId = crypto.randomUUID();
    expect(
      RouteLoadDraftSchema.parse({
        expectedVersion: 1,
        lines: [{ productId, quantity: '5.000' }],
      }),
    ).toMatchObject({ expectedVersion: 1 });
    expect(() =>
      RouteLoadDraftSchema.parse({ lines: [{ productId, quantity: '5.000' }] }),
    ).toThrow();
    expect(() => RouteTransitionSchema.parse({ expectedVersion: 0 })).toThrow();
  });

  it('accepts signed reconciliation input only as exact quantity strings', () => {
    const valid = {
      expectedVersion: 3,
      lines: [
        {
          productId: crypto.randomUUID(),
          physicalReturnQuantity: '4.000',
          differenceReason: 'One damaged unit',
        },
      ],
    };
    expect(RouteReconciliationSchema.parse(valid)).toEqual(valid);
    expect(() =>
      RouteReconciliationSchema.parse({
        ...valid,
        lines: [{ ...valid.lines[0], physicalReturnQuantity: 4 }],
      }),
    ).toThrow();
  });
});

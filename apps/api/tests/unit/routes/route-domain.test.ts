import { describe, expect, it } from 'vitest';
import {
  assertAssignedDriver,
  assertLoadPreconditions,
  calculateReconciliationLine,
  nextRouteState,
} from '../../../src/modules/routes/route-domain.js';

describe('route domain', () => {
  it('allows only the declared lifecycle transitions', () => {
    expect(nextRouteState('PREPARING', 'START')).toBe('EN_ROUTE');
    expect(nextRouteState('EN_ROUTE', 'RETURN')).toBe('RETURNED');
    expect(nextRouteState('RETURNED', 'CLOSE')).toBe('CLOSED');
    expect(() => nextRouteState('PREPARING', 'RETURN')).toThrowError(
      expect.objectContaining({ code: 'INVALID_ROUTE_TRANSITION' }),
    );
    expect(() => nextRouteState('CLOSED', 'START')).toThrowError(
      expect.objectContaining({ code: 'INVALID_ROUTE_TRANSITION' }),
    );
  });

  it('permits only the assigned driver at the domain boundary', () => {
    expect(() => assertAssignedDriver('driver-a', 'driver-a')).not.toThrow();
    expect(() => assertAssignedDriver('driver-b', 'driver-a')).toThrowError(
      expect.objectContaining({ code: 'ROUTE_FORBIDDEN' }),
    );
  });

  it('requires a Preparing route with an editable draft load', () => {
    expect(() => assertLoadPreconditions('PREPARING', null, 'EDIT')).not.toThrow();
    expect(() => assertLoadPreconditions('PREPARING', 'DRAFT', 'CONFIRM')).not.toThrow();
    expect(() => assertLoadPreconditions('EN_ROUTE', 'CONFIRMED', 'EDIT')).toThrowError(
      expect.objectContaining({ code: 'ROUTE_NOT_PREPARING' }),
    );
    expect(() => assertLoadPreconditions('PREPARING', 'CONFIRMED', 'EDIT')).toThrowError(
      expect.objectContaining({ code: 'LOAD_ALREADY_CONFIRMED' }),
    );
    expect(() => assertLoadPreconditions('PREPARING', null, 'CONFIRM')).toThrowError(
      expect.objectContaining({ code: 'LOAD_NOT_DRAFT' }),
    );
  });

  it('uses loaded = sold + physical return + signed difference', () => {
    expect(calculateReconciliationLine('10', '3', '6')).toEqual({
      loaded: '10.000',
      sold: '3.000',
      expectedReturn: '7.000',
      physicalReturn: '6.000',
      difference: '1.000',
    });
    expect(calculateReconciliationLine('10', '3', '8')).toMatchObject({
      expectedReturn: '7.000',
      difference: '-1.000',
    });
    expect(() => calculateReconciliationLine('2', '3', '0')).toThrowError(
      expect.objectContaining({ code: 'RECONCILIATION_QUANTITY_INVALID' }),
    );
  });
});

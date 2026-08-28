import { canonicalDecimal, parseExactDecimal } from '../../shared/money.js';

export type RouteState = 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';
export type RouteAction = 'START' | 'RETURN' | 'CLOSE';

const transitions: Record<RouteState, Partial<Record<RouteAction, RouteState>>> = {
  PREPARING: { START: 'EN_ROUTE' },
  EN_ROUTE: { RETURN: 'RETURNED' },
  RETURNED: { CLOSE: 'CLOSED' },
  CLOSED: {},
};
export function nextRouteState(current: RouteState, action: RouteAction): RouteState {
  const next = transitions[current][action];
  if (!next)
    throw Object.assign(new Error(`Cannot ${action.toLowerCase()} a ${current} route`), {
      code: 'INVALID_ROUTE_TRANSITION',
    });
  return next;
}

export function assertAssignedDriver(actorId: string, assignedDriverId: string): void {
  if (actorId !== assignedDriverId)
    throw Object.assign(new Error('Only the assigned driver may perform this route operation'), {
      code: 'ROUTE_FORBIDDEN',
    });
}

export function assertLoadPreconditions(
  routeState: RouteState,
  loadState: 'DRAFT' | 'CONFIRMED' | null,
  action: 'EDIT' | 'CONFIRM',
): void {
  if (routeState !== 'PREPARING')
    throw Object.assign(new Error('Only Preparing routes accept load changes'), {
      code: 'ROUTE_NOT_PREPARING',
    });
  if (action === 'EDIT' && loadState === 'CONFIRMED')
    throw Object.assign(new Error('Confirmed load is immutable'), {
      code: 'LOAD_ALREADY_CONFIRMED',
    });
  if (action === 'CONFIRM' && loadState !== 'DRAFT')
    throw Object.assign(new Error('A draft load is required'), { code: 'LOAD_NOT_DRAFT' });
}

export function calculateReconciliationLine(
  loadedQuantity: string,
  soldQuantity: string,
  physicalReturnQuantity: string,
): {
  loaded: string;
  sold: string;
  expectedReturn: string;
  physicalReturn: string;
  difference: string;
} {
  const loaded = canonicalDecimal(loadedQuantity, 3);
  const sold = canonicalDecimal(soldQuantity, 3);
  const physicalReturn = canonicalDecimal(physicalReturnQuantity, 3);
  const expectedReturn = canonicalDecimal(parseExactDecimal(loaded).minus(sold), 3);
  if (parseExactDecimal(expectedReturn).isNegative())
    throw Object.assign(new Error('Sold quantity cannot exceed the loaded quantity'), {
      code: 'RECONCILIATION_QUANTITY_INVALID',
    });
  return {
    loaded,
    sold,
    expectedReturn,
    physicalReturn,
    difference: canonicalDecimal(parseExactDecimal(expectedReturn).minus(physicalReturn), 3),
  };
}

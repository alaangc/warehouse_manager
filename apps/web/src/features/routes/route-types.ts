export type RouteState = 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';

export interface RouteResource {
  id: string;
  routeNumber: string;
  state: RouteState;
  originLocationId: string;
  driverId: string;
  vehicleId: string;
  businessDate: string;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  returnedAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
  version: number;
}

export interface RouteLoad {
  id: string;
  routeId: string;
  state: 'DRAFT' | 'CONFIRMED';
  recordedBy: string;
  confirmedAt: string | null;
  lines: { productId: string; quantity: string }[];
  version: number;
}

export interface RouteDetail {
  route: RouteResource;
  load: RouteLoad | null;
  balances: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: string;
    version?: number;
    updatedAt?: string;
    lowStockAlert?: boolean;
  }>;
  movements: Array<Record<string, unknown>>;
  sales: Array<{
    id: string;
    saleNumber: string;
    status: 'COMPLETED' | 'CANCELLED';
    customerId: string;
    driverId: string;
    routeId: string;
    paymentMethod: string;
    total: string;
    completedAt: string;
    cancelledAt: string | null;
  }>;
  reconciliation: null | {
    id: string;
    routeId: string;
    state: 'APPROVED';
    recordedBy: string;
    approvedBy: string;
    approvedAt: string;
    version: number;
    lines: Array<{
      productId: string;
      loadedQuantity: string;
      soldQuantity: string;
      expectedReturnQuantity: string;
      physicalReturnQuantity: string;
      differenceQuantity: string;
      differenceReason: string | null;
    }>;
  };
}

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client.js';

export interface InventoryBalance {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  lowStockAlert: boolean;
  version: number;
  updatedAt: string;
  stockLocation: {
    id: string;
    kind: 'BRANCH' | 'ROUTE';
    label: string;
    branchId: string | null;
    routeId: string | null;
  };
}

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  unitId: string;
  standardUnitPrice: string;
  lowStockThreshold: string;
  active: boolean;
  version: number;
}
export interface InventoryMovement {
  id: string;
  operationId: string;
  operationType: string;
  productId: string;
  source: InventoryBalance['stockLocation'] | null;
  destination: InventoryBalance['stockLocation'] | null;
  quantity: string;
  sourceBalanceAfter: string | null;
  destinationBalanceAfter: string | null;
  actorId: string;
  reason: string | null;
  occurredAt: string;
  relatedEntityType: string;
  relatedEntityId: string;
  reversesMovementId: string | null;
}

export interface InventoryMovementFilters {
  productId?: string;
  branchId?: string;
  routeId?: string;
  operationType?: string;
  from?: string;
  to?: string;
}

export function useInventoryBalances(
  filters: { productId?: string; branchId?: string; routeId?: string; alertsOnly?: boolean } = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') query.set(key, String(value));
  return useQuery({
    queryKey: ['inventory-balances', filters],
    queryFn: () => apiRequest<{ data: InventoryBalance[] }>(`/inventory/balances?${query}`),
  });
}

export function useInventoryProduct(productId: string) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () =>
      apiRequest<{ data: InventoryProduct }>(`/products/${encodeURIComponent(productId)}`),
    enabled: Boolean(productId),
  });
}

export function useInventoryMovements(
  filters: InventoryMovementFilters = {},
  options: { enabled?: boolean } = {},
) {
  const query = new URLSearchParams();
  const filterKeys = ['productId', 'branchId', 'routeId', 'operationType', 'from', 'to'] as const;
  for (const key of filterKeys) {
    const value = filters[key];
    if (value !== undefined && value !== '') query.set(key, value);
  }
  const search = query.toString();
  return useQuery({
    queryKey: ['inventory-movements', filters],
    queryFn: () =>
      apiRequest<{ data: InventoryMovement[] }>(
        `/inventory/movements${search ? `?${search}` : ''}`,
      ),
    enabled: options.enabled ?? true,
  });
}

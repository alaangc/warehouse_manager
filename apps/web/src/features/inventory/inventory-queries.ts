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
export interface InventoryMovement {
  id: string;
  operation_id: string;
  operationType: string;
  product_id: string;
  quantity: string;
  reason: string | null;
  occurred_at: string;
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

export function useInventoryMovements(routeId?: string) {
  return useQuery({
    queryKey: ['inventory-movements', routeId],
    queryFn: () =>
      apiRequest<{ data: InventoryMovement[] }>(
        `/inventory/movements${routeId ? `?routeId=${encodeURIComponent(routeId)}` : ''}`,
      ),
  });
}

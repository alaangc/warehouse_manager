import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client.js';

export interface CustomerOption {
  id: string;
  customerNumber: string;
  displayName: string;
}
export interface ProductOption {
  id: string;
  sku: string;
  name: string;
}
export interface SaleSummary {
  id: string;
  sale_number: string;
  status: 'COMPLETED' | 'CANCELLED';
  total: string;
  completed_at: string;
}

export const useCustomerOptions = (search = '') =>
  useQuery({
    queryKey: ['customer-options', search],
    queryFn: () =>
      apiRequest<{ data: CustomerOption[] }>(
        `/customers?search=${encodeURIComponent(search)}&active=true`,
      ),
  });
export const useProductOptions = (search = '') =>
  useQuery({
    queryKey: ['product-options', search],
    queryFn: () =>
      apiRequest<{ data: ProductOption[] }>(
        `/products?search=${encodeURIComponent(search)}&active=true`,
      ),
  });
export const useSales = (options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ['sales'],
    queryFn: () => apiRequest<{ data: SaleSummary[] }>('/sales'),
    enabled: options.enabled ?? true,
  });

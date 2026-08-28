import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client.js';
import type { RouteDetail, RouteResource } from './route-types.js';

export function useRoutes() {
  return useQuery({
    queryKey: ['routes'],
    queryFn: () =>
      apiRequest<{
        data: RouteResource[];
        page: { hasNextPage: boolean; nextCursor: string | null };
      }>('/routes'),
  });
}

export function useRouteDetail(routeId: string | null) {
  return useQuery({
    queryKey: ['routes', routeId],
    queryFn: () => apiRequest<{ data: RouteDetail }>(`/routes/${routeId}`),
    enabled: Boolean(routeId),
  });
}

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client.js';
import type { RouteDetail, RouteResource } from './route-types.js';

export function useRoutes(scope: 'all' | 'active' | 'closed' = 'all') {
  return useQuery({
    queryKey: ['routes', 'list', scope],
    queryFn: async () => {
      const rows: RouteResource[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams();
        if (scope !== 'all') query.set('active', String(scope === 'active'));
        if (cursor) query.set('cursor', cursor);
        const response: {
          data: RouteResource[];
          page: { hasNextPage: boolean; nextCursor: string | null };
        } = await apiRequest(`/routes${query.size ? `?${query}` : ''}`);
        rows.push(...response.data);
        cursor = response.page?.nextCursor ?? null;
      } while (cursor);
      return {
        data: rows.filter(
          (route) =>
            scope === 'all' ||
            (scope === 'closed' ? route.state === 'CLOSED' : route.state !== 'CLOSED'),
        ),
        page: { hasNextPage: false, nextCursor: null },
      };
    },
  });
}

export function useRouteDetail(routeId: string | null) {
  return useQuery({
    queryKey: ['routes', routeId],
    queryFn: () => apiRequest<{ data: RouteDetail }>(`/routes/${routeId}`),
    enabled: Boolean(routeId),
  });
}

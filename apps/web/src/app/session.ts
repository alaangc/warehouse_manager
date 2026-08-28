import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SessionResponse, SessionUser } from '@warehouse/contracts';
import { apiRequest } from '../lib/api/client.js';

export type SessionState = { user: SessionUser | null; loading: boolean; error: Error | null };
export const SessionContext = createContext<SessionState>({
  user: null,
  loading: true,
  error: null,
});
export const useSession = () => useContext(SessionContext);

export function useSessionBootstrap(): SessionState {
  const query = useQuery({
    queryKey: ['session'],
    queryFn: () => apiRequest<SessionResponse>('/auth/session'),
    retry: false,
  });
  return { user: query.data?.data ?? null, loading: query.isLoading, error: query.error };
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionContext } from '../../src/app/session.js';
import { RoleOverviewPanel } from '../../src/features/overview/overview-page.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(['ADMINISTRATOR', 'DRIVER'] as const)(
  'uses the API overview and limits %s actions',
  async (role) => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              routes: [],
              actions: ['/users', '/sales/new', '/settings', 'https://untrusted.test'],
              grossTotal: '9007199254740993.21',
              lowStockCount: 4,
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <SessionContext.Provider
            value={{
              user: { id: 'actor', username: 'actor', displayName: 'Actor', role, active: true },
              loading: false,
              error: null,
            }}
          >
            <RoleOverviewPanel />
          </SessionContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('link', { name: 'Settings' });
    expect(fetcher).toHaveBeenCalledWith('/api/v1/overview', expect.anything());
    expect(screen.queryByText('https://untrusted.test')).not.toBeInTheDocument();
    if (role === 'DRIVER') {
      expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Completed sales total/)).not.toBeInTheDocument();
      expect(screen.getByText('New sale').closest('a')).toHaveAttribute('aria-disabled', 'true');
    } else {
      expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
      expect(screen.getByText('9007199254740993.21')).toBeInTheDocument();
    }
  },
);

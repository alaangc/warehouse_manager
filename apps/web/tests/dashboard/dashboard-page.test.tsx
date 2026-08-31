import type { SessionUser } from '@warehouse/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SessionContext } from '../../src/app/session.js';
import { DashboardPage } from '../../src/features/dashboard/dashboard-page.js';

const administrator: SessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Administrator',
  role: 'ADMINISTRATOR',
  active: true,
};
const driver: SessionUser = {
  id: '00000000-0000-4000-8000-000000000002',
  username: 'driver',
  displayName: 'Route Driver',
  role: 'DRIVER',
  active: true,
};
const routeId = '00000000-0000-4000-8000-000000000101';
const productId = '00000000-0000-4000-8000-000000000102';

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function route(state: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED', id = routeId) {
  return {
    id,
    routeNumber: `R-${state}`,
    state,
    originLocationId: '00000000-0000-4000-8000-000000000103',
    driverId: driver.id,
    vehicleId: '00000000-0000-4000-8000-000000000104',
    businessDate: '2026-08-31',
    createdBy: administrator.id,
    createdAt: '2026-08-31T12:00:00.000Z',
    startedAt: state === 'PREPARING' ? null : '2026-08-31T13:00:00.000Z',
    returnedAt: state === 'RETURNED' || state === 'CLOSED' ? '2026-08-31T18:00:00.000Z' : null,
    closedAt: state === 'CLOSED' ? '2026-08-31T19:00:00.000Z' : null,
    closedBy: state === 'CLOSED' ? administrator.id : null,
    version: 2,
  };
}

const balance = {
  id: '00000000-0000-4000-8000-000000000105',
  productId,
  productName: 'Widget',
  quantity: '2.000',
  lowStockAlert: true,
  version: 1,
  updatedAt: '2026-08-31T14:00:00.000Z',
  stockLocation: {
    id: '00000000-0000-4000-8000-000000000106',
    kind: 'ROUTE',
    label: 'R-EN_ROUTE',
    branchId: null,
    routeId,
  },
};

function renderDashboard(user: SessionUser) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SessionContext.Provider value={{ user, loading: false, error: null }}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('role-aware dashboard', () => {
  it('shows the administrator real route and inventory summary without requesting sales', async () => {
    const returnedRoute = route('RETURNED', crypto.randomUUID());
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/routes'))
        return jsonResponse({
          data: [route('EN_ROUTE'), returnedRoute],
          page: { hasNextPage: false, nextCursor: null },
        });
      if (url.endsWith('/inventory/balances'))
        return jsonResponse({ data: [balance], page: { hasNextPage: false, nextCursor: null } });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDashboard(administrator);

    expect(await screen.findByRole('heading', { name: 'Hello, Administrator!' })).toBeVisible();
    expect(await screen.findByText('R-RETURNED')).toBeVisible();
    expect(screen.getByRole('link', { name: /R-RETURNED/ })).toHaveAttribute(
      'href',
      `/routes?routeId=${returnedRoute.id}`,
    );
    expect(screen.getByText('Open routes').previousElementSibling).toHaveTextContent('2');
    await waitFor(() =>
      expect(screen.getByText('Low-stock balances shown').previousElementSibling).toHaveTextContent(
        '1',
      ),
    );
    expect(screen.getByRole('link', { name: 'Record inventory operation' })).toHaveAttribute(
      'href',
      '/inventory/operations/new',
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/sales'))).toBe(false);
  });

  it('shows assigned-route and sale shortcuts for a driver', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/routes'))
          return jsonResponse({
            data: [route('EN_ROUTE')],
            page: { hasNextPage: false, nextCursor: null },
          });
        if (url.endsWith('/inventory/balances'))
          return jsonResponse({ data: [balance], page: { hasNextPage: false, nextCursor: null } });
        if (url.endsWith('/sales'))
          return jsonResponse({
            data: [
              {
                id: crypto.randomUUID(),
                sale_number: 'S-100',
                status: 'COMPLETED',
                total: '25.00',
                completed_at: '2026-08-31T14:00:00.000Z',
              },
            ],
            page: { hasNextPage: false, nextCursor: null },
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderDashboard(driver);

    expect(await screen.findByRole('heading', { name: 'Hello, Route Driver!' })).toBeVisible();
    expect(await screen.findByText('R-EN_ROUTE')).toBeVisible();
    expect(screen.getByText('Completed sales shown').previousElementSibling).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: 'New sale' })).toHaveAttribute('href', '/sales/new');
    expect(screen.getByRole('link', { name: 'My sales' })).toHaveAttribute('href', '/sales');
  });
});

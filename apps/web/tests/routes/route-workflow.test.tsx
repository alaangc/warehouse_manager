import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReconciliationPage } from '../../src/features/routes/reconciliation-page.js';
import { RouteHistory } from '../../src/features/routes/route-history.js';
import { RouteOverview } from '../../src/features/routes/route-overview.js';
import type { RouteDetail } from '../../src/features/routes/route-types.js';

const detail: RouteDetail = {
  route: {
    id: crypto.randomUUID(),
    routeNumber: 'R-100',
    state: 'RETURNED',
    originLocationId: crypto.randomUUID(),
    driverId: crypto.randomUUID(),
    vehicleId: crypto.randomUUID(),
    businessDate: '2026-08-27',
    createdBy: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    returnedAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    version: 3,
  },
  load: {
    id: crypto.randomUUID(),
    routeId: crypto.randomUUID(),
    state: 'CONFIRMED',
    recordedBy: crypto.randomUUID(),
    confirmedAt: new Date().toISOString(),
    lines: [{ productId: crypto.randomUUID(), quantity: '5.000' }],
    version: 2,
  },
  balances: [],
  movements: [],
  sales: [],
  reconciliation: null,
};

describe('route workflow UI', () => {
  it('requires a reason when the physical return differs from the full load', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ReconciliationPage detail={detail} />
      </QueryClientProvider>,
    );
    const reason = screen.getByLabelText(/difference reason/i);
    expect(reason).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/physical return/i), { target: { value: '4.000' } });
    expect(reason).toBeEnabled();
    expect(reason).toBeRequired();
  });

  it('labels closed route history as read only', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<RouteHistory detail={{ ...detail, route: { ...detail.route, state: 'CLOSED' } }} />);
    expect(screen.getByText('Read only')).toBeInTheDocument();
  });

  it('shows the real lifecycle, route stock, and operational counts', () => {
    render(
      <RouteOverview
        detail={{
          ...detail,
          route: { ...detail.route, routeNumber: 'R-100', state: 'EN_ROUTE' },
          balances: [
            {
              id: crypto.randomUUID(),
              productId: detail.load!.lines[0]!.productId,
              productName: 'Route widget',
              quantity: '4.250',
            },
          ],
          movements: [{ id: 'movement-1' }, { id: 'movement-2' }],
          sales: [
            {
              id: crypto.randomUUID(),
              saleNumber: 'S-100',
              status: 'COMPLETED',
              customerId: crypto.randomUUID(),
              driverId: detail.route.driverId,
              routeId: detail.route.id,
              paymentMethod: 'CASH',
              total: '25.00',
              completedAt: new Date().toISOString(),
              cancelledAt: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'R-100' })).toBeVisible();
    expect(screen.getByText('Route widget')).toBeVisible();
    expect(screen.getByText('4.250')).toBeVisible();
    expect(screen.getByText('Completed sales').previousElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Movements recorded').previousElementSibling).toHaveTextContent('2');
  });
});

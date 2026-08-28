import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReconciliationPage } from '../../src/features/routes/reconciliation-page.js';
import { RouteHistory } from '../../src/features/routes/route-history.js';
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
});

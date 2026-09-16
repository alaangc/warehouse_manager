import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReconciliationPage } from '../../src/features/routes/reconciliation-page.js';
import type { RouteDetail } from '../../src/features/routes/route-types.js';

const productId = '00000000-0000-4000-8000-000000000901';
const routeId = '00000000-0000-4000-8000-000000000902';
const detail: RouteDetail = {
  route: {
    id: routeId,
    routeNumber: 'U-A-v1',
    state: 'RETURNED',
    originLocationId: routeId,
    driverId: routeId,
    vehicleId: routeId,
    businessDate: '2026-09-16',
    createdBy: routeId,
    createdAt: '2026-09-16T15:00:00Z',
    startedAt: '2026-09-16T16:00:00Z',
    returnedAt: '2026-09-16T17:00:00Z',
    closedAt: null,
    closedBy: null,
    version: 3,
  },
  load: {
    id: routeId,
    routeId,
    state: 'CONFIRMED',
    recordedBy: routeId,
    confirmedAt: '2026-09-16T16:00:00Z',
    version: 2,
    lines: [{ productId, quantity: '5.000' }],
  },
  balances: [{ id: productId, productId, productName: 'Usability product 01', quantity: '5.000' }],
  movements: [],
  sales: [],
  reconciliation: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: {} }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <ReconciliationPage detail={detail} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe('workflow accessibility: reconciliation', () => {
  it('groups return controls by a human-readable product name', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Usability product 01' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /Physical return/ })).toHaveAttribute(
      'inputmode',
      'decimal',
    );
  });

  it('prevents a missing or whitespace-only required reason from reaching the API', () => {
    const fetchMock = setup();
    fireEvent.change(screen.getByLabelText(/Physical return/), { target: { value: '4' } });
    const reason = screen.getByLabelText(/Difference reason/) as HTMLInputElement;
    expect(reason).toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Approve reconciliation' }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(reason.checkValidity()).toBe(false);
  });

  it('accepts equivalent decimal quantities without requiring a false difference', async () => {
    const fetchMock = setup();
    fireEvent.change(screen.getByLabelText(/Physical return/), { target: { value: '5' } });
    expect(screen.getByLabelText(/Difference reason/)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve reconciliation' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it.each(['-1', '1.1234', 'abc', ''])('rejects invalid return quantity %j locally', (quantity) => {
    const fetchMock = setup();
    const input = screen.getByLabelText(/Physical return/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: quantity } });
    fireEvent.change(screen.getByLabelText(/Difference reason/), {
      target: { value: 'Damaged unit' },
    });
    expect(input.checkValidity()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Approve reconciliation' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

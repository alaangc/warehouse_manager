import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminRoutePages } from '../../src/features/routes/admin-route-pages.js';
import { DriverRoutePages } from '../../src/features/routes/driver-route-pages.js';
import { ReconciliationPage } from '../../src/features/routes/reconciliation-page.js';
import { RouteOverview } from '../../src/features/routes/route-overview.js';
import type { RouteDetail, RouteResource } from '../../src/features/routes/route-types.js';

const routeId = '00000000-0000-4000-8000-000000000401';
const originId = '00000000-0000-4000-8000-000000000402';
const driverId = '00000000-0000-4000-8000-000000000403';
const vehicleId = '00000000-0000-4000-8000-000000000404';
const productId = '00000000-0000-4000-8000-000000000405';
const loadId = '00000000-0000-4000-8000-000000000406';

function route(state: RouteResource['state'] = 'PREPARING'): RouteResource {
  return {
    id: routeId,
    routeNumber: 'R-UI-401',
    state,
    originLocationId: originId,
    driverId,
    vehicleId,
    businessDate: '2026-09-03',
    createdBy: '00000000-0000-4000-8000-000000000407',
    createdAt: '2026-09-03T15:00:00.000Z',
    startedAt: state === 'PREPARING' ? null : '2026-09-03T16:00:00.000Z',
    returnedAt: state === 'RETURNED' || state === 'CLOSED' ? '2026-09-03T18:00:00.000Z' : null,
    closedAt: state === 'CLOSED' ? '2026-09-03T19:00:00.000Z' : null,
    closedBy: state === 'CLOSED' ? '00000000-0000-4000-8000-000000000407' : null,
    version: state === 'PREPARING' ? 1 : state === 'EN_ROUTE' ? 2 : state === 'RETURNED' ? 3 : 4,
  };
}

function detail(state: RouteResource['state'] = 'PREPARING'): RouteDetail {
  return {
    route: route(state),
    load: null,
    balances: [],
    movements: [],
    sales: [],
    reconciliation: null,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
      },
    }),
  );
}

function renderWithQuery(ui: ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('route workflow UI', () => {
  it('submits an Administrator route assignment and opens the created route', async () => {
    let created = false;
    const assignedRoute = route();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://warehouse.test');
      const method = init?.method ?? 'GET';
      if (url.pathname.endsWith(`/routes/${routeId}`)) return jsonResponse({ data: detail() });
      if (url.pathname.endsWith('/routes') && method === 'POST') {
        created = true;
        return jsonResponse({ data: assignedRoute }, 201);
      }
      if (url.pathname.endsWith('/routes'))
        return jsonResponse({
          data: created ? [assignedRoute] : [],
          page: { hasNextPage: false, nextCursor: null },
        });
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<AdminRoutePages />);

    fireEvent.change(await screen.findByLabelText('Route number'), {
      target: { value: 'R-UI-401' },
    });
    fireEvent.change(screen.getByLabelText('Origin location ID'), {
      target: { value: originId },
    });
    fireEvent.change(screen.getByLabelText('Driver ID'), { target: { value: driverId } });
    fireEvent.change(screen.getByLabelText('Vehicle ID'), { target: { value: vehicleId } });
    fireEvent.change(screen.getByLabelText('Business date'), {
      target: { value: '2026-09-03' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('heading', { name: 'R-UI-401' })).toBeVisible();
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(createCall?.[0]).toBe('/api/v1/routes');
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      routeNumber: 'R-UI-401',
      originLocationId: originId,
      driverId,
      vehicleId,
      businessDate: '2026-09-03',
    });
  });

  it('lets the assigned Driver save and confirm a load, start, and return the route', async () => {
    let current = detail();
    const mutationCalls: Array<{
      method: string;
      path: string;
      body: unknown;
      key: string | null;
    }> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://warehouse.test');
      const method = init?.method ?? 'GET';
      if (url.pathname.endsWith('/routes') && method === 'GET')
        return jsonResponse({
          data: [current.route],
          page: { hasNextPage: false, nextCursor: null },
        });
      if (url.pathname.endsWith(`/routes/${routeId}`) && method === 'GET')
        return jsonResponse({ data: current });
      const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : null;
      mutationCalls.push({
        method,
        path: url.pathname,
        body,
        key: new Headers(init?.headers).get('Idempotency-Key'),
      });
      if (url.pathname.endsWith(`/routes/${routeId}/load`) && method === 'PUT') {
        current = {
          ...current,
          load: {
            id: loadId,
            routeId,
            state: 'DRAFT',
            recordedBy: driverId,
            confirmedAt: null,
            lines: [{ productId, quantity: '5.000' }],
            version: 2,
          },
        };
        return jsonResponse({ data: current.load });
      }
      if (url.pathname.endsWith(`/routes/${routeId}/load/confirmation`)) {
        current = {
          ...current,
          load: { ...current.load!, state: 'CONFIRMED', version: 3 },
          balances: [
            {
              id: crypto.randomUUID(),
              productId,
              productName: 'Route widget',
              quantity: '5.000',
            },
          ],
          movements: [
            {
              id: 'movement-load',
              operationType: 'ROUTE_LOAD',
              quantity: '5.000',
              occurredAt: '2026-09-03T15:30:00.000Z',
            },
          ],
        };
        return jsonResponse({ data: current });
      }
      if (url.pathname.endsWith(`/routes/${routeId}/start`)) {
        current = { ...current, route: route('EN_ROUTE') };
        return jsonResponse({ data: current.route });
      }
      if (url.pathname.endsWith(`/routes/${routeId}/return`)) {
        current = { ...current, route: route('RETURNED') };
        return jsonResponse({ data: current.route });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<DriverRoutePages />);

    fireEvent.change(await screen.findByLabelText('Product ID'), {
      target: { value: productId },
    });
    fireEvent.change(screen.getByLabelText('Load quantity'), {
      target: { value: '5.000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save full load' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm load' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start route' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark returned' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark returned' })).toBeNull());
    expect(mutationCalls.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `PUT /api/v1/routes/${routeId}/load`,
      `POST /api/v1/routes/${routeId}/load/confirmation`,
      `POST /api/v1/routes/${routeId}/start`,
      `POST /api/v1/routes/${routeId}/return`,
    ]);
    expect(mutationCalls.map(({ body }) => body)).toEqual([
      {
        expectedVersion: 1,
        lines: [{ productId, quantity: '5.000' }],
      },
      { expectedVersion: 2 },
      { expectedVersion: 1 },
      { expectedVersion: 2 },
    ]);
    expect(mutationCalls[0]!.key).toBeNull();
    expect(mutationCalls.slice(1).every(({ key }) => /^[0-9a-f-]{36}$/i.test(key ?? ''))).toBe(
      true,
    );
  });

  it('requires and submits a reason when the physical return differs', async () => {
    const returned = detail('RETURNED');
    returned.load = {
      id: loadId,
      routeId,
      state: 'CONFIRMED',
      recordedBy: driverId,
      confirmedAt: '2026-09-03T15:30:00.000Z',
      lines: [{ productId, quantity: '5.000' }],
      version: 3,
    };
    returned.balances = [
      {
        id: crypto.randomUUID(),
        productId,
        productName: 'Route widget',
        quantity: '5.000',
      },
    ];
    const fetchMock = vi.fn(() =>
      jsonResponse({
        data: {
          id: crypto.randomUUID(),
          routeId,
          state: 'APPROVED',
          lines: [],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ReconciliationPage detail={returned} />
      </QueryClientProvider>,
    );

    const reason = screen.getByLabelText(/difference reason/i);
    expect(reason).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/physical return/i), { target: { value: '4.000' } });
    expect(reason).toBeEnabled();
    expect(reason).toBeRequired();
    fireEvent.change(reason, { target: { value: 'One unit damaged' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve reconciliation' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/v1/routes/${routeId}/reconciliation`);
    expect(JSON.parse(String(request.body))).toEqual({
      expectedVersion: 3,
      lines: [
        {
          productId,
          physicalReturnQuantity: '4.000',
          differenceReason: 'One unit damaged',
        },
      ],
    });
    expect(new Headers(request.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('preserves the load form and allows retry after an optimistic conflict', async () => {
    let putAttempts = 0;
    let current = detail();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://warehouse.test');
      const method = init?.method ?? 'GET';
      if (url.pathname.endsWith('/routes') && method === 'GET')
        return jsonResponse({
          data: [current.route],
          page: { hasNextPage: false, nextCursor: null },
        });
      if (url.pathname.endsWith(`/routes/${routeId}`) && method === 'GET')
        return jsonResponse({ data: current });
      if (url.pathname.endsWith(`/routes/${routeId}/load`) && method === 'PUT') {
        putAttempts += 1;
        if (putAttempts === 1)
          return jsonResponse(
            {
              type: '/problems/optimistic-conflict',
              title: 'Conflict',
              status: 409,
              code: 'OPTIMISTIC_CONFLICT',
              detail: 'The route changed. Review it and try again.',
            },
            409,
          );
        current = {
          ...current,
          load: {
            id: loadId,
            routeId,
            state: 'DRAFT',
            recordedBy: driverId,
            confirmedAt: null,
            lines: [{ productId, quantity: '5.000' }],
            version: 2,
          },
        };
        return jsonResponse({ data: current.load });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<DriverRoutePages />);

    fireEvent.change(await screen.findByLabelText('Product ID'), {
      target: { value: productId },
    });
    fireEvent.change(screen.getByLabelText('Load quantity'), {
      target: { value: '5.000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save full load' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The route changed. Review it and try again.',
    );
    expect(screen.getByDisplayValue(productId)).toBeVisible();
    expect(screen.getByDisplayValue('5.000')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save full load' }));

    expect(await screen.findByRole('button', { name: 'Confirm load' })).toBeVisible();
    expect(putAttempts).toBe(2);
  });

  it('renders complete Closed-route history without ordinary action controls', async () => {
    const closed = detail('CLOSED');
    closed.load = {
      id: loadId,
      routeId,
      state: 'CONFIRMED',
      recordedBy: driverId,
      confirmedAt: '2026-09-03T15:30:00.000Z',
      lines: [{ productId, quantity: '5.000' }],
      version: 3,
    };
    closed.balances = [
      {
        id: crypto.randomUUID(),
        productId,
        productName: 'Route widget',
        quantity: '0.000',
      },
    ];
    closed.movements = [
      {
        id: 'movement-load',
        operationType: 'ROUTE_LOAD',
        quantity: '5.000',
        occurredAt: '2026-09-03T15:30:00.000Z',
      },
      {
        id: 'movement-difference',
        operationType: 'NEGATIVE_ADJUSTMENT',
        quantity: '1.000',
        occurredAt: '2026-09-03T18:30:00.000Z',
      },
      {
        id: 'movement-return',
        operationType: 'ROUTE_RETURN',
        quantity: '4.000',
        occurredAt: '2026-09-03T18:30:00.000Z',
      },
    ];
    closed.reconciliation = {
      id: crypto.randomUUID(),
      state: 'APPROVED',
      lines: [
        {
          productId,
          loadedQuantity: '5.000',
          soldQuantity: '0.000',
          physicalReturnQuantity: '4.000',
          differenceQuantity: '1.000',
          differenceReason: 'One unit damaged',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://warehouse.test');
        if (url.pathname.endsWith(`/routes/${routeId}`)) return jsonResponse({ data: closed });
        if (url.pathname.endsWith('/routes'))
          return jsonResponse({
            data: [closed.route],
            page: { hasNextPage: false, nextCursor: null },
          });
        throw new Error(`Unexpected request: ${url.pathname}`);
      }),
    );
    renderWithQuery(<DriverRoutePages />);

    expect(await screen.findByRole('heading', { name: 'R-UI-401' })).toBeVisible();
    expect(screen.getAllByText('Read only')).toHaveLength(2);
    expect(screen.getByText('Route load · 5.000')).toBeVisible();
    expect(screen.getByText('Negative adjustment · 1.000')).toBeVisible();
    expect(screen.getByText('Route return · 4.000')).toBeVisible();
    expect(screen.getByText(/One unit damaged/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save full load' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start route' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark returned' })).toBeNull();
  });

  it('shows the real lifecycle, route stock, and operational counts', () => {
    const overview = detail('EN_ROUTE');
    overview.load = {
      id: loadId,
      routeId,
      state: 'CONFIRMED',
      recordedBy: driverId,
      confirmedAt: '2026-09-03T15:30:00.000Z',
      lines: [{ productId, quantity: '5.000' }],
      version: 3,
    };
    overview.balances = [
      {
        id: crypto.randomUUID(),
        productId,
        productName: 'Route widget',
        quantity: '4.250',
      },
    ];
    overview.movements = [{ id: 'movement-1' }, { id: 'movement-2' }];
    overview.sales = [
      {
        id: crypto.randomUUID(),
        saleNumber: 'S-100',
        status: 'COMPLETED',
        customerId: crypto.randomUUID(),
        driverId,
        routeId,
        paymentMethod: 'CASH',
        total: '25.00',
        completedAt: '2026-09-03T17:00:00.000Z',
        cancelledAt: null,
      },
    ];
    render(<RouteOverview detail={overview} />);

    expect(screen.getByRole('heading', { name: 'R-UI-401' })).toBeVisible();
    expect(screen.getByText('Route widget')).toBeVisible();
    expect(screen.getByText('4.250')).toBeVisible();
    expect(screen.getByText('Completed sales').previousElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Movements recorded').previousElementSibling).toHaveTextContent('2');
  });
});

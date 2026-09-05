import type { SessionUser } from '@warehouse/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from 'react-router-dom';
import { router } from '../../src/app/router.js';
import { SessionContext } from '../../src/app/session.js';

const administrator: SessionUser = {
  id: crypto.randomUUID(),
  username: 'admin',
  displayName: 'Administrator',
  role: 'ADMINISTRATOR',
  active: true,
};
const initialId = crypto.randomUUID();
const correctionId = crypto.randomUUID();

function close(overrides: Record<string, unknown> = {}) {
  return {
    id: initialId,
    closeNumber: 'CC-100',
    periodKind: 'DAY',
    anchorDate: '2026-09-04',
    periodStart: '2026-09-04T07:00:00Z',
    periodEnd: '2026-09-05T07:00:00Z',
    businessTimezone: 'America/Hermosillo',
    status: 'CURRENT',
    supersedesCashCloseId: null,
    supersededByCashCloseId: null,
    correctionReason: null,
    currencyCode: 'MXN',
    grossTotal: '101.01',
    partnerRate: '0.500000',
    partnerAmount: '50.51',
    remainingAmount: '50.50',
    roundingMode: 'HALF_AWAY_FROM_ZERO',
    lines: [
      { reportingGroup: 'SODAS', total: '100.01' },
      { reportingGroup: 'CHARCOAL', total: '1.00' },
      { reportingGroup: 'TOSTADAS', total: '0.00' },
      { reportingGroup: 'OTHER', total: '0.00' },
    ],
    contributingSaleIds: [crypto.randomUUID()],
    createdBy: administrator.id,
    createdAt: '2026-09-04T15:00:00Z',
    ...overrides,
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

async function renderCashCloses(user: SessionUser = administrator) {
  await router.navigate('/cash-closes');
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <SessionContext.Provider value={{ user, loading: false, error: null }}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await router.navigate('/');
});

describe('cash-close UI', () => {
  it('blocks Driver access without requesting financial records', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await renderCashCloses({ ...administrator, role: 'DRIVER' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses the same request key after an uncertain server failure', async () => {
    let failed = false;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST')
        return jsonResponse({ data: [], page: { hasNextPage: false, nextCursor: null } });
      if (!failed) {
        failed = true;
        return jsonResponse({ title: 'Server Error', status: 500, detail: 'Please retry.' }, 500);
      }
      return jsonResponse({ data: close() }, 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderCashCloses();
    fireEvent.click(await screen.findByRole('button', { name: 'Create cash close' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm cash close' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please retry.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm cash close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const requests = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(requests).toHaveLength(2);
    expect(new Headers(requests[0]![1]?.headers).get('Idempotency-Key')).toBe(
      new Headers(requests[1]![1]?.headers).get('Idempotency-Key'),
    );
  });
  it('confirms a local calendar close and renders exact API-resolved totals', async () => {
    const created = close();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://warehouse.test');
      if (url.pathname.endsWith('/cash-closes') && init?.method === 'POST')
        return jsonResponse({ data: created }, 201);
      return jsonResponse({ data: [], page: { hasNextPage: false, nextCursor: null } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderCashCloses();

    fireEvent.change(await screen.findByLabelText('Anchor date'), {
      target: { value: '2026-09-04' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create cash close' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm cash close' });
    expect(dialog).toHaveTextContent('2026-09-04');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm cash close' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    const mutation = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(mutation[0]).toBe('/api/v1/cash-closes');
    expect(JSON.parse(String(mutation[1]?.body))).toEqual({
      periodKind: 'DAY',
      anchorDate: '2026-09-04',
    });
    expect(new Headers(mutation[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await screen.findByText('CC-100')).toBeVisible();
    expect(screen.getByText('MXN 101.01')).toBeVisible();
    expect(screen.getByText('MXN 50.51')).toBeVisible();
    expect(screen.getByText('MXN 50.50')).toBeVisible();
    expect(screen.getByText(/Sep 4, 2026/)).toBeVisible();
    expect(screen.getByText(/Sep 5, 2026/)).toBeVisible();
  });

  it('shows current and superseded versions with immutable predecessor navigation', async () => {
    const corrected = close({
      id: correctionId,
      closeNumber: 'CC-101',
      supersedesCashCloseId: initialId,
      correctionReason: 'Late sale recorded',
      createdAt: '2026-09-04T16:00:00Z',
    });
    const original = close({
      status: 'SUPERSEDED',
      supersededByCashCloseId: correctionId,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://warehouse.test');
        if (url.pathname.endsWith(`/cash-closes/${initialId}`))
          return jsonResponse({ data: original });
        if (url.pathname.endsWith(`/cash-closes/${correctionId}`))
          return jsonResponse({ data: corrected });
        return jsonResponse({
          data: [corrected, original],
          page: { hasNextPage: false, nextCursor: null },
        });
      }),
    );
    await renderCashCloses();

    const currentRow = await screen.findByRole('row', { name: /CC-101/ });
    expect(currentRow).toHaveTextContent('Current');
    expect(currentRow).toHaveTextContent('Late sale recorded');
    const oldRow = screen.getByRole('row', { name: /CC-100/ });
    expect(oldRow).toHaveTextContent('Superseded');
    fireEvent.click(within(oldRow).getByRole('button', { name: 'View CC-100' }));
    expect(await screen.findByRole('link', { name: 'Superseded by CC-101' })).toBeVisible();
  });

  it('requires a correction reason and displays stale or duplicate conflicts', async () => {
    let problemCode: 'CASH_CLOSE_NOT_CURRENT' | 'CASH_CLOSE_PERIOD_ALREADY_CURRENT' =
      'CASH_CLOSE_NOT_CURRENT';
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST')
          return jsonResponse(
            {
              title: 'Conflict',
              status: 409,
              code: problemCode,
              detail:
                problemCode === 'CASH_CLOSE_NOT_CURRENT'
                  ? 'This cash close is no longer current.'
                  : 'A current cash close already exists for this period.',
            },
            409,
          );
        return jsonResponse({ data: [close()], page: { hasNextPage: false, nextCursor: null } });
      }),
    );
    await renderCashCloses();

    fireEvent.click(await screen.findByRole('button', { name: 'Correct CC-100' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm correction' }));
    expect(await screen.findByText('A correction reason is required.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Late sale recorded' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm correction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer current/i);

    problemCode = 'CASH_CLOSE_PERIOD_ALREADY_CURRENT';
    fireEvent.click(await screen.findByRole('button', { name: 'Create cash close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm cash close', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('renders explicit empty and server-failure states', async () => {
    let fail = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        fail
          ? jsonResponse(
              { title: 'Server Error', status: 500, detail: 'Cash closes are unavailable.' },
              500,
            )
          : jsonResponse({ data: [], page: { hasNextPage: false, nextCursor: null } }),
      ),
    );
    await renderCashCloses();
    expect(await screen.findByText('No cash closes have been created.')).toBeVisible();
    fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh cash closes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/i);
  });
});

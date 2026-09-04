import type { SessionUser } from '@warehouse/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

async function renderReports() {
  await router.navigate('/reports');
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <SessionContext.Provider value={{ user: administrator, loading: false, error: null }}>
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

describe('reporting UI', () => {
  it('submits local period controls and displays API-resolved boundaries with report rows', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://warehouse.test');
      if (url.pathname.endsWith('/reports/sales-by-driver'))
        return jsonResponse({
          data: {
            reportType: 'SALES_BY_DRIVER',
            generatedAt: '2026-09-04T15:00:00Z',
            businessTimezone: 'America/Hermosillo',
            filters: {
              periodKind: 'WEEK',
              anchorDate: '2026-09-04',
              periodStart: '2026-08-31T07:00:00Z',
              periodEnd: '2026-09-07T07:00:00Z',
            },
            rows: [{ driverId: crypto.randomUUID(), driverName: 'Route Driver', total: '125.50' }],
            totals: { grossTotal: '125.50' },
          },
        });
      return jsonResponse({ data: { rows: [], totals: {} } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderReports();

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Period kind' }));
    fireEvent.click(screen.getByRole('option', { name: 'Week' }));
    fireEvent.change(screen.getByLabelText('Anchor date'), { target: { value: '2026-09-04' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Report type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Sales by driver' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          '/api/v1/reports/sales-by-driver?periodKind=WEEK&anchorDate=2026-09-04',
        ),
        expect.any(Object),
      ),
    );
    expect(await screen.findByText('America/Hermosillo')).toBeVisible();
    expect(screen.getByText(/Aug 31, 2026/)).toBeVisible();
    expect(screen.getByText(/Sep 7, 2026/)).toBeVisible();
    const table = screen.getByRole('table', { name: 'Sales by driver report' });
    expect(table).toHaveTextContent('Route Driver');
    expect(table).toHaveTextContent('MXN 125.50');
  });

  it('renders exact financial totals and fixed reporting-group rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://warehouse.test');
        if (url.pathname.endsWith('/reports/financial-summary'))
          return jsonResponse({
            data: {
              reportType: 'FINANCIAL_SUMMARY',
              generatedAt: '2026-09-04T15:00:00Z',
              businessTimezone: 'America/Hermosillo',
              filters: {
                periodKind: 'DAY',
                anchorDate: '2026-09-04',
                periodStart: '2026-09-04T07:00:00Z',
                periodEnd: '2026-09-05T07:00:00Z',
              },
              rows: [
                { reportingGroup: 'SODAS', total: '10.01' },
                { reportingGroup: 'CHARCOAL', total: '5.00' },
                { reportingGroup: 'TOSTADAS', total: '1.00' },
                { reportingGroup: 'OTHER', total: '0.10' },
              ],
              totals: {
                grossTotal: '16.11',
                partnerRate: '0.500000',
                partnerAmount: '8.06',
                remainingAmount: '8.05',
              },
            },
          });
        return jsonResponse({ data: { rows: [], totals: {} } });
      }),
    );
    await renderReports();

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Report type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Financial summary' }));
    fireEvent.change(screen.getByLabelText('Anchor date'), { target: { value: '2026-09-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }));

    expect(await screen.findByText('MXN 16.11')).toBeVisible();
    expect(screen.getByText('MXN 8.06')).toBeVisible();
    expect(screen.getByText('MXN 8.05')).toBeVisible();
    for (const group of ['Sodas', 'Charcoal', 'Tostadas', 'Other']) {
      expect(screen.getByRole('row', { name: new RegExp(group, 'i') })).toBeVisible();
    }
  });

  it('shows explicit empty and invalid-period failure states', async () => {
    let invalid = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        invalid
          ? jsonResponse(
              {
                title: 'Validation Failed',
                status: 422,
                code: 'INVALID_REPORTING_PERIOD',
                detail: 'The reporting period is invalid.',
              },
              422,
            )
          : jsonResponse({
              data: {
                reportType: 'BEST_SELLING_PRODUCTS',
                generatedAt: '2026-09-04T15:00:00Z',
                businessTimezone: 'America/Hermosillo',
                filters: {},
                rows: [],
                totals: {},
              },
            }),
      ),
    );
    await renderReports();

    fireEvent.change(await screen.findByLabelText('Anchor date'), {
      target: { value: '2026-09-04' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
    expect(await screen.findByText('No activity matches this period.')).toBeVisible();

    invalid = true;
    fireEvent.change(screen.getByLabelText('Anchor date'), { target: { value: '2026-02-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/reporting period is invalid/i);
  });
});

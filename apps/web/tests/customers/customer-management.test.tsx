import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { SessionUser } from '@warehouse/contracts';
import { SessionContext } from '../../src/app/session.js';
import { CustomerForm } from '../../src/features/customers/customer-form.js';
import { CustomerPages } from '../../src/features/customers/customer-pages.js';
import type { Customer } from '../../src/features/customers/customer-types.js';

const customer: Customer = {
  id: crypto.randomUUID(),
  customerNumber: 'C-100',
  displayName: 'Test customer',
  city: 'Magdalena',
  active: true,
  version: 1,
};

const administrator: SessionUser = {
  id: crypto.randomUUID(),
  username: 'admin',
  displayName: 'Administrator',
  role: 'ADMINISTRATOR',
  active: true,
};

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function renderCustomerPages(user: SessionUser) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SessionContext.Provider value={{ user, loading: false, error: null }}>
        <MemoryRouter>
          <CustomerPages />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('customer management', () => {
  it('requires a reason before an active customer can be archived', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CustomerForm customer={customer} onSaved={() => undefined} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive customer' }));
    expect(await screen.findByText('An archive reason is required.')).toBeInTheDocument();
  });

  it('shows an administrator directory with immutable purchase history', async () => {
    const archivedCustomer: Customer = {
      ...customer,
      id: crypto.randomUUID(),
      customerNumber: 'C-101',
      displayName: 'Archived customer',
      active: false,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://warehouse.test');
        if (url.pathname.endsWith(`/customers/${customer.id}/prices`))
          return jsonResponse({ data: [] });
        if (url.pathname.endsWith(`/customers/${customer.id}/sales`))
          return jsonResponse({
            data: [
              {
                id: crypto.randomUUID(),
                saleNumber: 'S-100',
                status: 'COMPLETED',
                paymentMethod: 'CASH',
                routeId: crypto.randomUUID(),
                total: '125.50',
                completedAt: '2026-08-31T14:00:00.000Z',
              },
            ],
          });
        if (url.pathname.endsWith('/customers'))
          return jsonResponse({
            data: [
              {
                ...customer,
                contactName: 'Customer Contact',
                phone: '555-0100',
                address: 'Main Street 10',
              },
              archivedCustomer,
            ],
          });
        throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
      }),
    );

    renderCustomerPages(administrator);

    expect(await screen.findByRole('button', { name: /C-100/ })).toBeVisible();
    expect(screen.getByText('Customers shown').previousElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Archived shown').previousElementSibling).toHaveTextContent('1');
    fireEvent.click(await screen.findByRole('button', { name: /C-100/ }));

    expect(await screen.findByRole('heading', { name: 'Test customer' })).toBeVisible();
    expect(screen.getByText('Customer Contact')).toBeVisible();
    expect(await screen.findByText('S-100')).toBeVisible();
    expect(screen.getByText('MXN 125.50')).toBeVisible();
    expect(screen.getByText('Cash')).toBeVisible();
  });

  it('keeps the driver customer directory read only and active-only', async () => {
    const driver: SessionUser = {
      ...administrator,
      id: crypto.randomUUID(),
      username: 'driver',
      displayName: 'Driver',
      role: 'DRIVER',
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://warehouse.test');
      if (url.pathname.endsWith('/customers')) return jsonResponse({ data: [customer] });
      throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCustomerPages(driver);

    expect(await screen.findByText(/existing active customers available for sales/i)).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: /C-100/ }));
    expect(await screen.findByRole('heading', { name: 'Test customer' })).toBeVisible();
    expect(screen.getByText(/access is read only/i)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Edit customer' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('active=true'),
      expect.any(Object),
    );
  });
});

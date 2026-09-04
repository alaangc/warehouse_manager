import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { SessionUser } from '@warehouse/contracts';
import { SessionContext } from '../../src/app/session.js';
import { CustomerForm } from '../../src/features/customers/customer-form.js';
import { CustomerPages } from '../../src/features/customers/customer-pages.js';
import { CustomerPrices } from '../../src/features/customers/customer-prices.js';
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

function renderCustomerPages(user: SessionUser) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
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
  it('creates a customer with all form values and exact nullable fields', async () => {
    const created = {
      ...customer,
      contactName: 'Buyer Name',
      phone: '+52 631 100 2000',
      email: 'buyer@example.com',
      address: 'Main Street 20',
      notes: 'Deliver at the back entrance',
    };
    const onSaved = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: created }, 201));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CustomerForm onSaved={onSaved} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Customer name'), {
      target: { value: created.displayName },
    });
    fireEvent.change(screen.getByLabelText('Contact name'), {
      target: { value: created.contactName },
    });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: created.phone } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: created.email } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: created.address } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: created.city } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: created.notes } });
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/customers');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(init.body))).toEqual({
      displayName: created.displayName,
      contactName: created.contactName,
      phone: created.phone,
      email: created.email,
      address: created.address,
      city: created.city,
      notes: created.notes,
    });
    expect(onSaved).toHaveBeenCalledWith(created);
  });

  it('requires and submits a confirmation reason before archiving an active customer', async () => {
    const archived = { ...customer, active: false, version: 2 };
    const onSaved = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: archived }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CustomerForm customer={customer} onSaved={onSaved} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive customer' }));
    expect(await screen.findByText('An archive reason is required.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Archive reason'), {
      target: { value: 'Customer requested closure' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Archive customer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/customers/${customer.id}`);
    expect(JSON.parse(String(init.body))).toMatchObject({
      expectedVersion: 1,
      displayName: customer.displayName,
      city: customer.city,
      active: false,
      reason: 'Customer requested closure',
    });
    expect(onSaved).toHaveBeenCalledWith(archived);
  });

  it('shows an administrator directory with immutable purchase history', async () => {
    const archivedCustomer: Customer = {
      ...customer,
      id: crypto.randomUUID(),
      customerNumber: 'C-101',
      displayName: 'Archived customer',
      active: false,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
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
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCustomerPages(administrator);

    expect(await screen.findByRole('button', { name: /C-100/ })).toBeVisible();
    expect(screen.getByText('Customers shown').previousElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Archived shown').previousElementSibling).toHaveTextContent('1');
    fireEvent.change(screen.getByLabelText('Search customers'), {
      target: { value: 'Test customer' },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('search=Test+customer'),
        expect.any(Object),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: /C-100/ }));

    expect(await screen.findByRole('heading', { name: 'Test customer' })).toBeVisible();
    expect(screen.getByText('Customer Contact')).toBeVisible();
    expect(await screen.findByText('S-100')).toBeVisible();
    expect(screen.getByText('MXN 125.50')).toBeVisible();
    expect(screen.getByText('Cash')).toBeVisible();
  });

  it('deactivates an old special price and creates an exact replacement', async () => {
    const productId = crypto.randomUUID();
    const originalId = crypto.randomUUID();
    const replacementId = crypto.randomUUID();
    let rows = [
      {
        id: originalId,
        customerId: customer.id,
        productId,
        unitPrice: '17.2500',
        validFrom: '2026-09-01T16:00:00.000Z',
        validTo: null,
        active: true,
      },
    ];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://warehouse.test');
      const method = init?.method ?? 'GET';
      if (url.pathname.endsWith(`/customer-prices/${originalId}/deactivation`)) {
        rows = rows.map((price) => ({ ...price, active: false }));
        return jsonResponse({ data: rows[0] });
      }
      if (url.pathname.endsWith(`/customers/${customer.id}/prices`) && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as {
          productId: string;
          unitPrice: string;
          validFrom: string;
        };
        rows = [
          ...rows,
          {
            id: replacementId,
            customerId: customer.id,
            productId: body.productId,
            unitPrice: body.unitPrice,
            validFrom: body.validFrom,
            validTo: null,
            active: true,
          },
        ];
        return jsonResponse({ data: rows.at(-1) }, 201);
      }
      if (url.pathname.endsWith(`/customers/${customer.id}/prices`) && method === 'GET')
        return jsonResponse({ data: rows });
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <CustomerPrices customerId={customer.id} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(new RegExp(productId))).toHaveTextContent('17.25');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument(),
    );

    const replacementValidFrom = '2026-09-04T10:30';
    fireEvent.change(screen.getByLabelText('Product ID'), { target: { value: productId } });
    fireEvent.change(screen.getByLabelText('Exact unit price'), {
      target: { value: '16.5000' },
    });
    fireEvent.change(screen.getByLabelText('Valid from'), {
      target: { value: replacementValidFrom },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add price' }));

    await waitFor(() => expect(screen.getAllByText(new RegExp(productId))).toHaveLength(2));
    const mutationCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(mutationCalls).toHaveLength(2);
    expect(mutationCalls[0]?.[0]).toBe(`/api/v1/customer-prices/${originalId}/deactivation`);
    expect(JSON.parse(String(mutationCalls[0]?.[1]?.body))).toEqual({
      reason: 'Replaced or retired by administrator',
    });
    expect(mutationCalls[1]?.[0]).toBe(`/api/v1/customers/${customer.id}/prices`);
    expect(JSON.parse(String(mutationCalls[1]?.[1]?.body))).toEqual({
      productId,
      unitPrice: '16.5000',
      validFrom: new Date(replacementValidFrom).toISOString(),
    });
  });

  it('keeps edit values visible and explains an optimistic conflict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          type: '/problems/optimistic-conflict',
          title: 'Conflict',
          status: 409,
          code: 'OPTIMISTIC_CONFLICT',
          detail: 'This customer changed elsewhere. Refresh it and try again.',
        },
        409,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <CustomerForm customer={customer} onSaved={() => undefined} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Customer name'), {
      target: { value: 'Locally edited customer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }));

    expect(await screen.findByText(/changed elsewhere/i)).toBeVisible();
    expect(screen.getByLabelText('Customer name')).toHaveValue('Locally edited customer');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      expectedVersion: customer.version,
      displayName: 'Locally edited customer',
      active: true,
    });
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
    expect(screen.queryByRole('button', { name: 'New customer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit customer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Special prices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Purchase history' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('active=true'),
      expect.any(Object),
    );
  });
});

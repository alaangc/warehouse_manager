import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SaleForm } from '../../src/features/sales/sale-form.js';

const routeId = '00000000-0000-4000-8000-000000000301';
const customerId = '00000000-0000-4000-8000-000000000302';
const firstProductId = '00000000-0000-4000-8000-000000000303';
const secondProductId = '00000000-0000-4000-8000-000000000304';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'sale-csrf' },
  });
}

function renderSaleForm() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <SaleForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const activeRoute = {
  id: routeId,
  routeNumber: 'R-301',
  state: 'EN_ROUTE',
  originLocationId: crypto.randomUUID(),
  driverId: crypto.randomUUID(),
  vehicleId: crypto.randomUUID(),
  businessDate: '2026-08-31',
  createdBy: crypto.randomUUID(),
  createdAt: '2026-08-31T12:00:00.000Z',
  startedAt: '2026-08-31T13:00:00.000Z',
  returnedAt: null,
  closedAt: null,
  closedBy: null,
  version: 2,
};

const balances = [
  {
    id: crypto.randomUUID(),
    productId: firstProductId,
    productName: 'Cola 600 ml',
    quantity: '8.000',
  },
  {
    id: crypto.randomUUID(),
    productId: secondProductId,
    productName: 'Charcoal 3 kg',
    quantity: '5.000',
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sale form', () => {
  it('blocks sale entry when the driver has no route in progress', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse({ data: [], page: { hasNextPage: false, nextCursor: null } })),
      ),
    );

    renderSaleForm();

    expect(await screen.findByText(/need an assigned route in the En route state/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open routes' })).toHaveAttribute('href', '/routes');
    expect(screen.queryByRole('button', { name: 'Confirm sale' })).not.toBeInTheDocument();
  });

  it('quotes and confirms a multiline sale using only active-route products', async () => {
    const requestBodies: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://warehouse.test');
      if (url.pathname.endsWith('/routes'))
        return Promise.resolve(
          jsonResponse({
            data: [activeRoute],
            page: { hasNextPage: false, nextCursor: null },
          }),
        );
      if (url.pathname.endsWith(`/routes/${routeId}`))
        return Promise.resolve(
          jsonResponse({
            data: {
              route: activeRoute,
              load: null,
              balances,
              movements: [],
              sales: [],
              reconciliation: null,
            },
          }),
        );
      if (url.pathname.endsWith('/customers'))
        return Promise.resolve(
          jsonResponse({
            data: [{ id: customerId, customerNumber: 'C-100', displayName: 'Corner Store' }],
          }),
        );
      if (url.pathname.endsWith('/sales/quote')) {
        requestBodies.push({ path: url.pathname, body: JSON.parse(String(init?.body)) });
        return Promise.resolve(
          jsonResponse({
            data: {
              customerId,
              routeId,
              currencyCode: 'MXN',
              lines: [
                {
                  productId: firstProductId,
                  productName: 'Cola 600 ml',
                  categoryName: 'Sodas',
                  unitCode: 'EA',
                  quantity: '1.500',
                  appliedPriceSource: 'CUSTOMER',
                  unitPrice: '16.0000',
                  lineAmount: '24.00',
                  availableQuantity: '8.000',
                  available: true,
                },
                {
                  productId: secondProductId,
                  productName: 'Charcoal 3 kg',
                  categoryName: 'Charcoal',
                  unitCode: 'BAG',
                  quantity: '2.000',
                  appliedPriceSource: 'STANDARD',
                  unitPrice: '38.0000',
                  lineAmount: '76.00',
                  availableQuantity: '5.000',
                  available: true,
                },
              ],
              total: '100.00',
              quotedAt: '2026-08-31T14:00:00.000Z',
            },
          }),
        );
      }
      if (url.pathname.endsWith('/sales')) {
        requestBodies.push({ path: url.pathname, body: JSON.parse(String(init?.body)) });
        return Promise.resolve(
          jsonResponse(
            {
              data: {
                id: crypto.randomUUID(),
                saleNumber: 'S-301',
                ticketNumber: 'T-301',
                currencyCode: 'MXN',
                total: '100.00',
              },
            },
            201,
          ),
        );
      }
      throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSaleForm();

    expect(await screen.findByRole('combobox', { name: 'Active route' })).toHaveTextContent(
      'R-301',
    );
    fireEvent.mouseDown(screen.getByLabelText('Customer'));
    fireEvent.click(await screen.findByRole('option', { name: 'C-100 — Corner Store' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: products' }));

    fireEvent.mouseDown(await screen.findByLabelText('Product'));
    fireEvent.click(await screen.findByRole('option', { name: 'Cola 600 ml' }));
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add another product' }));

    const productInputs = screen.getAllByLabelText('Product');
    fireEvent.mouseDown(productInputs[1]!);
    fireEvent.click(await screen.findByRole('option', { name: 'Charcoal 3 kg' }));
    const quantityInputs = screen.getAllByLabelText('Quantity');
    fireEvent.change(quantityInputs[1]!, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review authoritative quote' }));

    expect(await screen.findByRole('heading', { name: 'Review and confirm' })).toBeVisible();
    expect(screen.getByText('MXN 100.00')).toBeVisible();
    expect(screen.getByText('Customer-specific price')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Payment method' })).toHaveTextContent('Cash');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sale' }));

    expect(await screen.findByRole('heading', { name: 'Sale ticket' })).toBeVisible();
    expect(screen.getByText(/T-301/)).toBeVisible();
    await waitFor(() => expect(requestBodies).toHaveLength(2));
    expect(requestBodies[0]?.body.lines).toEqual([
      { productId: firstProductId, quantity: '1.5' },
      { productId: secondProductId, quantity: '2' },
    ]);
    expect(requestBodies[1]?.body).toMatchObject({
      customerId,
      routeId,
      paymentMethod: 'CASH',
      lines: [
        { productId: firstProductId, quantity: '1.5' },
        { productId: secondProductId, quantity: '2' },
      ],
    });
  });
});

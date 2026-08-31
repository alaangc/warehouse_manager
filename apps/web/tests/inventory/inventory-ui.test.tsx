import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SessionUser } from '@warehouse/contracts';
import { SessionContext } from '../../src/app/session.js';
import { ProductForm } from '../../src/features/catalog/catalog-forms.js';
import { InventoryOperationForm } from '../../src/features/inventory/inventory-operation-form.js';
import { InventoryPage } from '../../src/features/inventory/inventory-page.js';
import { MovementHistory } from '../../src/features/inventory/movement-history.js';
import { ProductDetailPage } from '../../src/features/inventory/product-detail-page.js';
import {
  quantityFromScaled,
  scaledQuantity,
} from '../../src/features/inventory/inventory-quantity.js';
import { setCsrfToken } from '../../src/lib/api/client.js';

const productId = '00000000-0000-4000-8000-000000000101';
const categoryId = '00000000-0000-4000-8000-000000000102';
const unitId = '00000000-0000-4000-8000-000000000103';
const magdalenaBranchId = '00000000-0000-4000-8000-000000000104';
const caborcaBranchId = '00000000-0000-4000-8000-000000000105';
const routeId = '00000000-0000-4000-8000-000000000106';
const administrator: SessionUser = {
  id: '00000000-0000-4000-8000-000000000108',
  username: 'admin',
  displayName: 'Administrator',
  role: 'ADMINISTRATOR',
  active: true,
};

const queryClients: QueryClient[] = [];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

function renderWithQuery(ui: ReactElement, initialEntry = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClients.push(queryClient);
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={{ user: administrator, loading: false, error: null }}>
          <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
        </SessionContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

function fillInventoryEntry() {
  fireEvent.change(screen.getByLabelText('Branch ID'), {
    target: { value: magdalenaBranchId },
  });
  fireEvent.change(screen.getByLabelText('Product ID'), { target: { value: productId } });
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2.500' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Initial receiving' } });
}

afterEach(() => {
  cleanup();
  for (const queryClient of queryClients) queryClient.clear();
  queryClients.length = 0;
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe('inventory and catalog UI', () => {
  it('converts positive and negative fixed-scale quantities exactly', () => {
    expect(scaledQuantity('9007199254740993.125')).toBe(9007199254740993125n);
    expect(scaledQuantity('-0.500')).toBe(-500n);
    expect(quantityFromScaled(-500n)).toBe('-0.500');
  });

  it('submits exact product values and converts an empty description to null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: productId } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<ProductForm />);

    fireEvent.change(screen.getByLabelText(/SKU/), { target: { value: 'WIDGET-01' } });
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Widget' } });
    fireEvent.change(screen.getByLabelText(/Category ID/), { target: { value: categoryId } });
    fireEvent.change(screen.getByLabelText(/Unit ID/), { target: { value: unitId } });
    fireEvent.change(screen.getByLabelText(/Standard unit price/), {
      target: { value: '12.3456' },
    });
    fireEvent.change(screen.getByLabelText(/Low stock threshold/), {
      target: { value: '3.250' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/products');
    expect(request).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(request.body))).toEqual({
      sku: 'WIDGET-01',
      name: 'Widget',
      categoryId,
      unitId,
      standardUnitPrice: '12.3456',
      lowStockThreshold: '3.250',
      description: null,
    });
  });

  it('renders low-stock alerts and refetches when the alert filter changes', async () => {
    const lowStock = {
      id: 'balance-low',
      productId,
      productName: 'Low widget',
      quantity: '2.000',
      lowStockAlert: true,
      version: 2,
      updatedAt: '2026-08-29T12:00:00.000Z',
      stockLocation: {
        id: 'stock-magdalena',
        kind: 'BRANCH',
        label: 'Magdalena',
        branchId: magdalenaBranchId,
        routeId: null,
      },
    };
    const available = {
      ...lowStock,
      id: 'balance-available',
      productId: '00000000-0000-4000-8000-000000000107',
      productName: 'Available widget',
      quantity: '20.000',
      lowStockAlert: false,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const filtered = String(input).includes('alertsOnly=true');
      return Promise.resolve(jsonResponse({ data: filtered ? [lowStock] : [lowStock, available] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<InventoryPage />);

    expect(await screen.findByText('Low widget')).toBeInTheDocument();
    expect(screen.getByText('Available widget')).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Show low-stock alerts only' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/inventory/balances?alertsOnly=true',
        expect.objectContaining({ credentials: 'include' }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('Available widget')).not.toBeInTheDocument());
    expect(screen.getByText('Low widget')).toBeInTheDocument();
  });

  it('renders real product detail, exact values, locations, and recent movements', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/products/${productId}`))
        return Promise.resolve(
          jsonResponse({
            data: {
              id: productId,
              sku: 'WIDGET-01',
              name: 'Low widget',
              description: 'A traceable inventory product.',
              categoryId,
              unitId,
              standardUnitPrice: '12.3456',
              lowStockThreshold: '3.250',
              active: true,
              version: 2,
            },
          }),
        );
      if (url.includes('/inventory/balances'))
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'balance-low',
                productId,
                productName: 'Low widget',
                quantity: '2.000',
                lowStockAlert: true,
                version: 2,
                updatedAt: '2026-08-29T12:00:00.000Z',
                stockLocation: {
                  id: 'stock-magdalena',
                  kind: 'BRANCH',
                  label: 'Magdalena',
                  branchId: magdalenaBranchId,
                  routeId: null,
                },
              },
            ],
          }),
        );
      if (url.endsWith('/categories'))
        return Promise.resolve(jsonResponse({ data: [{ id: categoryId, name: 'Sodas' }] }));
      if (url.endsWith('/units'))
        return Promise.resolve(jsonResponse({ data: [{ id: unitId, name: 'Piece' }] }));
      if (url.includes('/inventory/movements'))
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'movement-1',
                operationId: 'operation-1',
                operationType: 'ENTRY',
                productId,
                source: null,
                destination: {
                  id: 'stock-magdalena',
                  kind: 'BRANCH',
                  label: 'Magdalena',
                  branchId: magdalenaBranchId,
                  routeId: null,
                },
                quantity: '2.000',
                sourceBalanceAfter: null,
                destinationBalanceAfter: '2.000',
                actorId: administrator.id,
                reason: 'Initial stock',
                occurredAt: '2026-08-29T12:00:00.000Z',
                relatedEntityType: 'INVENTORY_OPERATION',
                relatedEntityId: 'operation-1',
                reversesMovementId: null,
              },
            ],
          }),
        );
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithQuery(
      <Routes>
        <Route path="/inventory/products/:productId" element={<ProductDetailPage />} />
      </Routes>,
      `/inventory/products/${productId}`,
    );

    expect(await screen.findByRole('heading', { name: 'Low widget' })).toBeVisible();
    expect(screen.getByText('MXN 12.3456')).toBeVisible();
    expect(screen.getByText('Sodas')).toBeVisible();
    expect(screen.getByText('Piece')).toBeVisible();
    expect(screen.getAllByText('Magdalena')).not.toHaveLength(0);
    expect(await screen.findByText('Entry')).toBeVisible();
  });

  it('shows a validation error for a quantity with too many decimals', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<InventoryOperationForm />);

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm operation' }));

    expect(await screen.findByText(/up to 3 decimals/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits an inventory entry with a stable idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'operation-1' } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<InventoryOperationForm />);
    fillInventoryEntry();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm operation' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/inventory/operations');
    expect(request).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(request.body))).toEqual({
      operationType: 'ENTRY',
      branchId: magdalenaBranchId,
      reason: 'Initial receiving',
      lines: [{ productId, quantity: '2.500' }],
    });
    const headers = request.headers as Headers;
    expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('shows the API conflict detail without treating it as a successful operation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          type: '/problems/insufficient-inventory',
          title: 'Conflict',
          status: 409,
          code: 'INSUFFICIENT_INVENTORY',
          detail: 'The requested quantity is no longer available.',
        },
        409,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<InventoryOperationForm />);
    fillInventoryEntry();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm operation' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The requested quantity is no longer available.');
    expect(screen.getByDisplayValue('2.500')).toBeInTheDocument();
  });

  it('renders movement history and applies the assigned-route filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'movement-1',
            operationId: 'operation-1',
            operationType: 'TRANSFER',
            productId,
            source: {
              id: 'stock-magdalena',
              kind: 'BRANCH',
              label: 'Magdalena',
              branchId: magdalenaBranchId,
              routeId: null,
            },
            destination: {
              id: 'stock-caborca',
              kind: 'BRANCH',
              label: 'Caborca',
              branchId: caborcaBranchId,
              routeId: null,
            },
            quantity: '4.000',
            sourceBalanceAfter: '6.000',
            destinationBalanceAfter: '4.000',
            actorId: '00000000-0000-4000-8000-000000000108',
            reason: 'Route replenishment',
            occurredAt: '2026-08-29T12:00:00.000Z',
            relatedEntityType: 'INVENTORY_OPERATION',
            relatedEntityId: 'operation-1',
            reversesMovementId: null,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<MovementHistory routeId={routeId} />);

    expect(await screen.findByText('Transfer')).toBeInTheDocument();
    const movementRow = screen.getByRole('row', { name: /Route replenishment/ });
    expect(within(movementRow).getByText(productId)).toBeInTheDocument();
    expect(within(movementRow).getAllByText('4.000')).toHaveLength(2);
    expect(within(movementRow).getByText('Magdalena')).toBeInTheDocument();
    expect(within(movementRow).getByText('Caborca')).toBeInTheDocument();
    expect(within(movementRow).getByText('6.000')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/inventory/movements?routeId=${routeId}`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('keeps source and destination branch identifiers distinct in transfer payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'operation-2' } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<InventoryOperationForm />);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Operation' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Transfer' }));
    fireEvent.change(screen.getByLabelText('Source branch ID'), {
      target: { value: magdalenaBranchId },
    });
    fireEvent.change(screen.getByLabelText('Destination branch ID'), {
      target: { value: caborcaBranchId },
    });
    fireEvent.change(screen.getByLabelText('Product ID'), { target: { value: productId } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.000' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Branch rebalance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm operation' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/inventory/transfers');
    expect(JSON.parse(String(request.body))).toEqual({
      sourceBranchId: magdalenaBranchId,
      destinationBranchId: caborcaBranchId,
      reason: 'Branch rebalance',
      lines: [{ productId, quantity: '1.000' }],
    });
  });
});

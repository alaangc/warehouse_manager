import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionContext } from '../../src/app/session.js';
import {
  ProductForm,
  SimpleCatalogForm,
  type CategoryRecord,
  type ProductRecord,
  type UnitRecord,
} from '../../src/features/catalog/catalog-forms.js';
import { CatalogPages } from '../../src/features/catalog/catalog-pages.js';

const category: CategoryRecord = {
  id: '00000000-0000-4000-8000-000000000201',
  name: 'Supplies',
  reportingGroup: 'OTHER',
  active: true,
  version: 1,
};
const unit: UnitRecord = {
  id: '00000000-0000-4000-8000-000000000202',
  code: 'EA',
  name: 'Each',
  quantityScale: 0,
  active: true,
  version: 1,
};
const product: ProductRecord = {
  id: '00000000-0000-4000-8000-000000000203',
  sku: 'WIDGET-01',
  name: 'Widget',
  description: null,
  categoryId: category.id,
  unitId: unit.id,
  standardUnitPrice: '12.5000',
  lowStockThreshold: '3.000',
  active: true,
  version: 4,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

function renderWithQuery(ui: ReactElement) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('catalog management', () => {
  it('requires an archive reason and submits an optimistic location update', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: '00000000-0000-4000-8000-000000000204',
          code: 'OLD',
          name: 'Old branch',
          active: false,
          version: 3,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(
      <SimpleCatalogForm
        kind="locations"
        record={{
          id: '00000000-0000-4000-8000-000000000204',
          code: 'OLD',
          name: 'Old branch',
          active: true,
          version: 2,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive record' }));
    expect(await screen.findByText('An archive reason is required.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Archive reason'), {
      target: { value: 'Branch consolidated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Archive record' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/locations/00000000-0000-4000-8000-000000000204');
    expect(request).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(JSON.parse(String(request.body))).toEqual({
      code: 'OLD',
      name: 'Old branch',
      expectedVersion: 2,
      active: false,
      reason: 'Branch consolidated',
    });
  });

  it('edits products with catalog option selectors and exact decimal strings', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { ...product, name: 'Updated widget', version: 5 } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(<ProductForm product={product} categories={[category]} units={[unit]} />);

    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Supplies');
    expect(screen.getByRole('combobox', { name: 'Unit' })).toHaveTextContent('EA — Each');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated widget' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/products/${product.id}`);
    expect(JSON.parse(String(request.body))).toEqual({
      sku: product.sku,
      name: 'Updated widget',
      description: null,
      categoryId: category.id,
      unitId: unit.id,
      standardUnitPrice: '12.5000',
      lowStockThreshold: '3.000',
      expectedVersion: 4,
      active: true,
    });
  });

  it('shows all catalog lists but hides management forms from drivers', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/products')) return Promise.resolve(jsonResponse({ data: [product] }));
      if (url.endsWith('/categories')) return Promise.resolve(jsonResponse({ data: [category] }));
      if (url.endsWith('/units')) return Promise.resolve(jsonResponse({ data: [unit] }));
      if (url.endsWith('/locations'))
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: '00000000-0000-4000-8000-000000000204',
                code: 'MAGDALENA',
                name: 'Magdalena',
                active: true,
                version: 1,
              },
            ],
          }),
        );
      return Promise.resolve(
        jsonResponse({
          data: [
            {
              id: '00000000-0000-4000-8000-000000000205',
              code: 'VAN-1',
              name: 'Van 1',
              registration: null,
              active: true,
              version: 1,
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithQuery(
      <SessionContext.Provider
        value={{
          user: {
            id: '00000000-0000-4000-8000-000000000206',
            username: 'driver',
            displayName: 'Driver',
            role: 'DRIVER',
          },
          loading: false,
          error: null,
        }}
      >
        <CatalogPages />
      </SessionContext.Provider>,
    );

    expect(await screen.findByText('Widget')).toBeInTheDocument();
    expect(await screen.findByText('Magdalena')).toBeInTheDocument();
    expect(await screen.findByText('Supplies')).toBeInTheDocument();
    expect(await screen.findByText('Each')).toBeInTheDocument();
    expect(await screen.findByText('Van 1')).toBeInTheDocument();
    expect(screen.getByText('Driver access is read only.')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});

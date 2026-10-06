import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerCredit } from '../../src/features/customers/customer-credit.js';

vi.mock('../../src/features/documents/document-center.js', () => ({
  DocumentCenter: ({ source }: { source: { sourceId: string } }) => (
    <div>Receipt {source.sourceId}</div>
  ),
}));
vi.mock('../../src/features/customers/sale-detail.js', () => ({
  SaleDetailDialog: ({ saleId }: { saleId: string }) => <div>Purchase detail {saleId}</div>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const notes = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    saleNumber: 'Nota: 001',
    total: '0.10',
    completedAt: '2026-10-05T12:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    saleNumber: 'Nota: 10601',
    total: '0.20',
    completedAt: '2026-10-05T12:00:00Z',
  },
];
const initial = { notes, noteCount: 2, total: '0.30', payments: [] };
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <CustomerCredit customerId="customer" />
    </QueryClientProvider>,
  );
}
it('selects notes, totals exact cents, submits check payment and opens its persisted receipt', async () => {
  let paid = false;
  const posts: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url, init: RequestInit) => {
      if (init.method === 'POST') {
        posts.push(init);
        paid = true;
        return Promise.resolve(Response.json({ data: { id: 'receipt-1' } }));
      }
      return Promise.resolve(
        Response.json({
          data: paid
            ? {
                notes: [],
                noteCount: 0,
                total: '0.00',
                payments: [{ id: 'receipt-1', total: '0.30', createdAt: '2026-10-05T12:00:00Z' }],
              }
            : initial,
        }),
      );
    }),
  );
  show();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Nota: 001' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Nota: 10601' }));
  expect(screen.getByText('Total to settle: USD 0.30')).toBeVisible();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Payment method' }));
  fireEvent.click(screen.getByRole('option', { name: 'Check', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Settle selected notes' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm settlement' }),
  );
  expect(await screen.findByText('Receipt receipt-1')).toBeVisible();
  expect(JSON.parse(String(posts[0]!.body))).toEqual({
    saleIds: notes.map((n) => n.id),
    paymentMethod: 'CHECK',
  });
  expect(new Headers(posts[0]!.headers).get('Idempotency-Key')).toBeTruthy();
  expect(posts).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(await screen.findByText('No outstanding notes.')).toBeVisible();
  fireEvent.click(await screen.findByRole('button', { name: 'View receipt' }));
  expect(await screen.findByText('Receipt receipt-1')).toBeVisible();
});
it('keeps the same idempotency key after an uncertain network failure', async () => {
  const keys: (string | null)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url, init: RequestInit) => {
      if (init.method === 'POST') {
        keys.push(new Headers(init.headers).get('Idempotency-Key'));
        return Promise.reject(new TypeError('Network error'));
      }
      return Promise.resolve(Response.json({ data: initial }));
    }),
  );
  show();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Nota: 001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Settle selected notes' }));
  const button = within(screen.getByRole('dialog')).getByRole('button', {
    name: 'Confirm settlement',
  });
  fireEvent.click(button);
  await waitFor(() => expect(keys).toHaveLength(1));
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(keys).toHaveLength(2));
  expect(keys[0]).toBe(keys[1]);
});

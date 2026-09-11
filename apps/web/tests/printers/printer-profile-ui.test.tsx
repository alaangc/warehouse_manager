import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionContext } from '../../src/app/session.js';
import { PrinterProfilePage } from '../../src/features/printers/printer-profile-page.js';

const profile = {
  id: '00000000-0000-4000-8000-000000000040',
  name: 'Route printer',
  model: 'BLE',
  serviceUuid: 'ffe0',
  writeCharacteristicUuid: 'ffe1',
  writeMode: 'WITH_RESPONSE',
  commandDialect: 'ESC_POS',
  paperWidthMm: 58,
  encoding: 'CP850',
  maxChunkBytes: 100,
  interChunkDelayMs: 20,
  active: true,
  version: 3,
  transport: 'WEB_BLUETOOTH_BLE',
};
function open(role: 'ADMINISTRATOR' | 'DRIVER' = 'ADMINISTRATOR', failure = 0) {
  const fetcher = vi.fn((_url: unknown, init?: RequestInit) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          init?.method === 'PATCH' && failure
            ? {
                status: failure,
                code: failure === 409 ? 'OPTIMISTIC_CONFLICT' : 'FORBIDDEN',
                title: 'Request failed',
              }
            : { data: init?.method === 'PATCH' ? profile : [profile] },
        ),
        {
          status: init?.method === 'PATCH' && failure ? failure : 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <SessionContext.Provider
        value={{
          user: { id: 'admin', username: 'admin', displayName: 'Admin', role, active: true },
          loading: false,
          error: null,
        }}
      >
        <PrinterProfilePage />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return fetcher;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('denies Drivers without requesting profiles', () => {
  const fetcher = open('DRIVER');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});
it('requires an archive reason and sends the original version', async () => {
  const fetcher = open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Route printer' }));
  fireEvent.click(screen.getByLabelText('Active'));
  fireEvent.click(screen.getByRole('button', { name: 'Save printer' }));
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Replaced device' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save printer' }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true),
  );
  const body = JSON.parse(
    String(fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')?.[1]?.body),
  );
  expect(body).toMatchObject({
    expectedVersion: 3,
    active: false,
    reason: 'Replaced device',
    serviceUuid: 'ffe0',
  });
});
it('validates a new profile before sending it', async () => {
  const fetcher = open();
  fireEvent.click(screen.getByRole('button', { name: 'New printer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save printer' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Check');
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});
it('creates a validated profile with numeric transport settings', async () => {
  const fetcher = open();
  fireEvent.click(screen.getByRole('button', { name: 'New printer' }));
  for (const [label, value] of [
    ['Name', 'New BLE'],
    ['Model', 'Model A'],
    ['Service UUID', 'ffe0'],
    ['Write characteristic UUID', 'ffe1'],
  ]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save printer' }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
  );
  const body = JSON.parse(
    String(fetcher.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]?.body),
  );
  expect(body).toMatchObject({
    name: 'New BLE',
    paperWidthMm: 58,
    maxChunkBytes: 100,
    interChunkDelayMs: 20,
    commandDialect: 'ESC_POS',
  });
  expect(body).not.toHaveProperty('expectedVersion');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Save printer' })).not.toBeInTheDocument(),
  );
});
it.each([403, 409, 422, 500])('preserves edits on HTTP %s failure', async (status) => {
  open('ADMINISTRATOR', status);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Route printer' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated printer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save printer' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByLabelText('Name')).toHaveValue('Updated printer');
  if (status === 409) {
    fireEvent.click(screen.getByRole('button', { name: 'Reload current profile' }));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Route printer'));
  }
});

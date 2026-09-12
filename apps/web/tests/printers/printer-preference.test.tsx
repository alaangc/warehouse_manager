import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionContext } from '../../src/app/session.js';
import { PrinterPreferencePage } from '../../src/features/printers/printer-preference-page.js';
import type {
  PrinterAdapter,
  PrinterConnection,
} from '../../src/features/printers/printer-adapter.js';
import { changeAppLanguage } from '../../src/i18n/index.js';

const profile = {
  id: '00000000-0000-4000-8000-000000000040',
  name: 'Printer A',
  active: true,
  version: 1,
};
function setup({
  preference = true,
  status = 0,
  result = 'SUCCEEDED' as 'SUCCEEDED' | 'FAILED' | 'UNKNOWN',
  terminalFailure = false,
} = {}) {
  let snapshot: PrinterConnection = { state: 'DISCONNECTED' };
  const listeners = new Set<() => void>();
  const publish = (state: PrinterConnection['state']) => {
    snapshot = { state };
    listeners.forEach((fn) => fn());
  };
  const adapter: PrinterAdapter = {
    capability: () => 'AVAILABLE',
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    connect: vi.fn(async () => {
      publish('CONNECTED');
    }),
    disconnect: vi.fn(() => publish('DISCONNECTED')),
    test: vi.fn(async () => ({ state: result })),
  };
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input),
      body = init?.body ? JSON.parse(String(init.body)) : {};
    if (init?.method && init.method !== 'GET') calls.push({ path, body });
    const failed =
      path.endsWith('/output-attempts') &&
      ((status && body.state === 'STARTED') || (terminalFailure && body.state !== 'STARTED'));
    const data = path.endsWith('/printer-profiles')
      ? [profile]
      : path.endsWith('/me/printer-preference')
        ? init?.method === 'PUT'
          ? body
          : preference
            ? { printerProfileId: profile.id }
            : null
        : body;
    return new Response(
      JSON.stringify(
        failed ? { status: status || 500, code: 'FORBIDDEN', title: 'Not accepted' } : { data },
      ),
      { status: failed ? status || 500 : 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const view = render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <SessionContext.Provider
        value={{
          user: {
            id: 'driver-1',
            username: 'driver',
            displayName: 'Driver',
            role: 'DRIVER',
            active: true,
          },
          loading: false,
          error: null,
        }}
      >
        <PrinterPreferencePage adapter={adapter} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, adapter, calls, fetcher };
}
async function connect() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Connect printer' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect printer' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Test printer' })).toBeEnabled());
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('selects and persists only the current account preference, without device handles', async () => {
  const s = setup({ preference: false });
  await screen.findByRole('option', { name: 'Printer A' });
  fireEvent.change(screen.getByLabelText('Printer'), { target: { value: profile.id } });
  fireEvent.click(screen.getByRole('button', { name: 'Save printer selection' }));
  await screen.findByText('Changes saved.');
  expect(s.calls).toEqual([
    { path: '/api/v1/me/printer-preference', body: { printerProfileId: profile.id } },
  ]);
  expect(s.adapter.connect).not.toHaveBeenCalled();
});
it.each(['SUCCEEDED', 'FAILED', 'UNKNOWN'] as const)(
  'records accepted STARTED then %s without business mutations',
  async (result) => {
    const s = setup({ result });
    await connect();
    fireEvent.click(screen.getByRole('button', { name: 'Test printer' }));
    await screen.findByText('Changes saved.');
    expect(screen.getByTestId('printer-test-result')).toHaveAttribute('data-state', result);
    expect(s.calls.map((call) => call.body.state)).toEqual(['STARTED', result, undefined]);
    expect(s.calls.every((call) => !('documentId' in call.body) && !('actorId' in call.body))).toBe(
      true,
    );
    expect(s.adapter.test).toHaveBeenCalledTimes(1);
  },
);
it.each([403, 409, 422, 500])(
  'does not write to a device when API acceptance fails with %s',
  async (status) => {
    const s = setup({ status });
    await connect();
    fireEvent.click(screen.getByRole('button', { name: 'Test printer' }));
    await screen.findByRole('alert');
    expect(s.adapter.test).not.toHaveBeenCalled();
    expect(s.calls).toHaveLength(1);
  },
);
it('does not repeat a physical write when saving the result fails', async () => {
  const s = setup({ terminalFailure: true });
  await connect();
  fireEvent.click(screen.getByRole('button', { name: 'Test printer' }));
  await screen.findByRole('alert');
  expect(s.adapter.test).toHaveBeenCalledTimes(1);
  expect(s.calls).toHaveLength(2);
  expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument();
});
it('waits for API acceptance and suppresses double clicks while a test is pending', async () => {
  const s = setup();
  await connect();
  let accept!: (response: Response) => void;
  s.fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        accept = resolve;
      }),
  );
  const button = screen.getByRole('button', { name: 'Test printer' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(s.adapter.test).not.toHaveBeenCalled();
  expect(button).toBeDisabled();
  await act(async () => {
    accept(
      new Response(JSON.stringify({ data: { state: 'STARTED' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  await screen.findByText('Changes saved.');
  expect(s.adapter.test).toHaveBeenCalledTimes(1);
});
it('disconnects on unmount and keeps selected printer through language changes', async () => {
  const s = setup();
  await connect();
  await act(() => changeAppLanguage('es'));
  expect(screen.getByLabelText('Impresora')).toHaveValue(profile.id);
  expect(screen.getByRole('button', { name: 'Probar impresora' })).toBeEnabled();
  const before = vi.mocked(s.adapter.disconnect).mock.calls.length;
  s.unmount();
  expect(s.adapter.disconnect).toHaveBeenCalledTimes(before + 1);
});
it('does not write or save under another session after leaving during API acceptance', async () => {
  const s = setup();
  await connect();
  let accept!: (response: Response) => void;
  s.fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        accept = resolve;
      }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Test printer' }));
  s.unmount();
  const requestCount = s.fetcher.mock.calls.length;
  await act(async () => {
    accept(
      new Response(JSON.stringify({ data: { state: 'STARTED' } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  expect(s.adapter.test).not.toHaveBeenCalled();
  expect(s.fetcher).toHaveBeenCalledTimes(requestCount);
});

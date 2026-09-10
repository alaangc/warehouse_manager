import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from 'react-router-dom';
import { router } from '../../src/app/router.js';
import { SessionContext } from '../../src/app/session.js';
import { changeAppLanguage } from '../../src/i18n/index.js';

const user = {
  id: '00000000-0000-4000-8000-000000000010',
  username: 'admin',
  displayName: 'Administrator',
  role: 'ADMINISTRATOR' as const,
  active: true,
};
const driver = {
  ...user,
  id: '00000000-0000-4000-8000-000000000011',
  username: 'driver',
  displayName: 'Test Driver',
  role: 'DRIVER' as const,
  version: 1,
};
const printer = {
  id: '00000000-0000-4000-8000-000000000040',
  name: 'Approved printer',
  model: 'BLE',
  active: true,
  version: 1,
};
const respond = (data: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(status >= 400 ? data : { data }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
function mockApi(failure?: { status: number; code: string; detail: string }) {
  const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method && init.method !== 'GET')
      return failure
        ? respond({ ...failure, title: 'Conflict' }, failure.status)
        : respond(
            { ...driver, ...JSON.parse(String(init.body)), version: 2 },
            init.method === 'POST' ? 201 : 200,
          );
    if (path.includes('/settings/business'))
      return respond({
        version: 1,
        currencyCode: 'MXN',
        businessTimezone: 'America/Hermosillo',
        partnerShareRate: '0.500000',
      });
    if (path.includes('/printer-profiles')) return respond([printer]);
    if (path.includes('/me/printer-preference')) return respond({ printerProfileId: printer.id });
    return respond([driver]);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
async function open(path: string, role: 'ADMINISTRATOR' | 'DRIVER' = 'ADMINISTRATOR') {
  await router.navigate(path);
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <SessionContext.Provider value={{ user: { ...user, role }, loading: false, error: null }}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await router.navigate('/');
});

describe('administration UI', () => {
  it('creates a Driver from validated user inputs', async () => {
    const fetcher = mockApi();
    await open('/users');
    fireEvent.click(await screen.findByRole('button', { name: 'New user' }));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-driver' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New Driver' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'long-test-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save user' }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([path, init]) =>
            String(path) === '/api/v1/users' &&
            init?.method === 'POST' &&
            JSON.parse(String(init.body)).role === 'DRIVER',
        ),
      ).toBe(true),
    );
  });
  it.each([
    { status: 409, code: 'OPTIMISTIC_CONFLICT', detail: 'Reload the record before saving.' },
    {
      status: 409,
      code: 'USER_ACTIVE_ROUTE',
      detail: 'Close or reassign the active route before changing this Driver.',
    },
  ])('shows $code without discarding the form', async (failure) => {
    mockApi(failure);
    await open('/users');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Test Driver' }));
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Edited Driver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save user' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(failure.detail);
    expect(screen.getByLabelText('Display name')).toHaveValue('Edited Driver');
  });
  it('submits business settings with the displayed version', async () => {
    const fetcher = mockApi();
    await open('/settings');
    fireEvent.change(await screen.findByLabelText('Business timezone'), {
      target: { value: 'America/Tijuana' },
    });
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'New operating timezone' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save business settings' }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([, init]) =>
            init?.method === 'PATCH' && JSON.parse(String(init.body)).expectedVersion === 1,
        ),
      ).toBe(true),
    );
  });
  it('denies direct Driver navigation to users without fetching administrator data', async () => {
    const fetcher = mockApi();
    await open('/users', 'DRIVER');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /administrator|forbidden|permission/i,
    );
    expect(fetcher.mock.calls.some(([path]) => String(path).includes('/users'))).toBe(false);
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });
  it('T115 requires a deactivation reason and omits an unchanged password', async () => {
    const fetcher = mockApi();
    await open('/users');
    fireEvent.click(await screen.findByRole('button', {name: 'Edit Test Driver'}));
    fireEvent.mouseDown(screen.getAllByRole('combobox', {name: 'Status'}).at(-1)!);
    fireEvent.click(await screen.findByRole('option', {name: 'Inactive'}));
    fireEvent.click(screen.getByRole('button', {name: 'Save user'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(/reason/i);
    expect(fetcher.mock.calls.some(([,init]) => init?.method === 'PATCH')).toBe(false);
    fireEvent.change(screen.getByLabelText('Reason'), {target: {value: 'Driver left the business'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save user'}));
    await waitFor(() => expect(fetcher.mock.calls.some(([,init]) => init?.method === 'PATCH')).toBe(true));
    const call = fetcher.mock.calls.find(([,init]) => init?.method === 'PATCH')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({expectedVersion: 1, displayName: driver.displayName, role: 'DRIVER', active: false, reason: 'Driver left the business'});
  });
  it('T115 rejects short passwords and preserves edits when switching language', async () => {
    const fetcher = mockApi();
    await open('/users');
    fireEvent.click(await screen.findByRole('button', {name: 'New user'}));
    fireEvent.change(screen.getByLabelText('Username'), {target: {value: 'new-user'}});
    fireEvent.change(screen.getByLabelText('Display name'), {target: {value: 'Nombre conservado'}});
    fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'short'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save user'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(/12/);
    expect(fetcher.mock.calls.some(([,init]) => init?.method === 'POST')).toBe(false);
    await changeAppLanguage('es');
    expect(await screen.findByLabelText('Nombre visible')).toHaveValue('Nombre conservado');
    expect(screen.getByRole('button', {name: 'Guardar usuario'})).toBeInTheDocument();
  });
  it('T115 paginates users and resets the cursor when search changes', async () => {
    const fetcher = mockApi();
    fetcher.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({data: [driver], page: {hasNextPage: true, nextCursor: 'next-cursor'}}), {headers: {'Content-Type': 'application/json'}})));
    await open('/users');
    await screen.findByRole('button', {name: 'Edit Test Driver'});
    fireEvent.click(screen.getByRole('button', {name: 'Next page'}));
    await waitFor(() => expect(fetcher.mock.calls.some(([path]) => String(path).includes('cursor=next-cursor'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Search users'), {target: {value: 'alice'}});
    await waitFor(() => expect(String(fetcher.mock.calls.at(-1)![0])).toContain('search=alice'));
    expect(String(fetcher.mock.calls.at(-1)![0])).not.toContain('cursor=');
  });
  it('T115 preserves business edits on conflict and reloads only on explicit request', async () => {
    const fetcher = mockApi({status: 409, code: 'OPTIMISTIC_CONFLICT', detail: 'Reload the record before saving.'});
    await open('/settings');
    fireEvent.change(await screen.findByLabelText('Business timezone'), {target: {value: 'America/Tijuana'}});
    fireEvent.change(screen.getByLabelText('Reason'), {target: {value: 'New schedule'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save business settings'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload the record');
    expect(screen.getByLabelText('Business timezone')).toHaveValue('America/Tijuana');
    fetcher.mockImplementation(() => respond({version: 3, currencyCode: 'USD', businessTimezone: 'America/Phoenix'}));
    fireEvent.click(screen.getByRole('button', {name: 'Discard edits and reload current record'}));
    await waitFor(() => expect(screen.getByLabelText('Business timezone')).toHaveValue('America/Phoenix'));
    expect(screen.getByLabelText('Reason')).toHaveValue('');
  });
  it('T115 never fetches business settings for Drivers', async () => {
    const fetcher = mockApi();
    await open('/settings', 'DRIVER');
    expect(await screen.findByRole('combobox', {name: 'Language'})).toBeInTheDocument();
    expect(screen.queryByLabelText('Business timezone')).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([path]) => String(path).includes('/settings/business'))).toBe(false);
  });
  it('offers Drivers only approved printer controls and language settings', async () => {
    mockApi();
    await open('/settings', 'DRIVER');
    expect(await screen.findByLabelText('Printer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Business timezone')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New printer' })).not.toBeInTheDocument();
  });
  it('explains unsupported Bluetooth and disables connection', async () => {
    mockApi();
    vi.stubGlobal('navigator', { ...navigator, bluetooth: undefined });
    await open('/settings', 'DRIVER');
    expect(await screen.findByText(/Bluetooth is not supported/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect printer' })).toBeDisabled();
  });
  it('shows permission denial without recording a successful print', async () => {
    const fetcher = mockApi();
    vi.stubGlobal('navigator', {
      ...navigator,
      bluetooth: {
        requestDevice: vi
          .fn()
          .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
      },
    });
    await open('/settings', 'DRIVER');
    fireEvent.click(await screen.findByRole('button', { name: 'Connect printer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission|denied/i);
    expect(
      fetcher.mock.calls.some(([, init]) => init?.body && String(init.body).includes('SUCCEEDED')),
    ).toBe(false);
  });
  it.each(['SUCCEEDED', 'FAILED', 'UNKNOWN'])(
    'displays persisted printer test state %s',
    async (state) => {
      mockApi();
      const fetcher = vi.mocked(fetch);
      fetcher.mockImplementation((input) =>
        String(input).includes('/me/printer-preference')
          ? respond({ printerProfileId: printer.id, lastTestResult: state })
          : respond([printer]),
      );
      await open('/settings', 'DRIVER');
      expect(await screen.findByTestId('printer-test-result')).toHaveAttribute('data-state', state);
    },
  );
});

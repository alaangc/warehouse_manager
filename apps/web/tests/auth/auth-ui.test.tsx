import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { SessionUser } from '@warehouse/contracts';
import { AppLayout } from '../../src/app/layout.js';
import { SessionContext, type SessionState, useSessionBootstrap } from '../../src/app/session.js';
import { LoginPage } from '../../src/features/auth/login-page.js';
import { setCsrfToken } from '../../src/lib/api/client.js';

const administrator: SessionUser = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'admin',
  displayName: 'Administrator',
  role: 'ADMINISTRATOR',
  active: true,
};

function renderApp(
  children: ReactNode,
  session: SessionState,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

function BootstrappedSession({ children }: { children: ReactNode }) {
  return (
    <SessionContext.Provider value={useSessionBootstrap()}>{children}</SessionContext.Provider>
  );
}

describe('authentication UI', () => {
  beforeEach(() => setCsrfToken(null));

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setCsrfToken(null);
  });

  it('redirects an unauthenticated protected route to login', async () => {
    renderApp(
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route path="/login" element={<div>Login required</div>} />
          <Route path="/" element={<AppLayout />}>
            <Route path="inventory" element={<div>Private inventory</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
      { user: null, loading: false, error: null },
    );

    expect(await screen.findByText('Login required')).toBeInTheDocument();
    expect(screen.queryByText('Private inventory')).not.toBeInTheDocument();
  });

  it('signs in and returns to the requested route', async () => {
    const responseBody = { data: administrator };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-token' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderApp(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/inventory' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/inventory" element={<div>Inventory destination</div>} />
        </Routes>
      </MemoryRouter>,
      { user: null, loading: false, error: null },
      queryClient,
    );

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: 'development-password-change-me' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Inventory destination')).toBeInTheDocument();
    expect(queryClient.getQueryData(['session'])).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('shows a safe message when credentials are rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            code: 'INVALID_CREDENTIALS',
          }),
          { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );

    renderApp(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
      { user: null, loading: false, error: null },
    );

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect username or password.')).toBeInTheDocument();
  });

  it('restores the CSRF token with the session and uses it to log out', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: administrator }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'restored-csrf' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <BootstrappedSession>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/login" element={<div>Signed out</div>} />
              <Route path="/" element={<AppLayout />}>
                <Route index element={<div>Overview</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </BootstrappedSession>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    await waitFor(() => expect(queryClient.getQueryData(['session'])).toBeNull());
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const logoutHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers;
    expect(logoutHeaders.get('X-CSRF-Token')).toBe('restored-csrf');
  });
});

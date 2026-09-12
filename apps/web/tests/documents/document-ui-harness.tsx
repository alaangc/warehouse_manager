import type { ComponentType } from 'react';
import type { SessionUser } from '@warehouse/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { SessionContext } from '../../src/app/session.js';

export const actor: SessionUser = {
  id: '00000000-0000-4000-8000-000000000121',
  username: 'driver',
  displayName: 'Driver',
  role: 'DRIVER',
  active: true,
};
export const source = {
  documentType: 'TICKET',
  sourceType: 'SALE',
  sourceId: '00000000-0000-4000-8000-000000000122',
  sourceState: 'COMPLETED',
  driverId: actor.id,
};
export const document = {
  id: '00000000-0000-4000-8000-000000000123',
  documentType: 'TICKET',
  sourceType: 'SALE',
  sourceId: source.sourceId,
  contentVersion: '1',
  state: 'READY',
  contentHash: 'a'.repeat(64),
  createdBy: '00000000-0000-4000-8000-000000000010',
  createdAt: '2026-09-11T15:00:00Z',
  readyAt: '2026-09-11T15:00:01Z',
};
export const attempt = {
  id: '00000000-0000-4000-8000-000000000124',
  documentId: document.id,
  actorId: document.createdBy,
  mode: 'DOWNLOAD',
  state: 'SUCCEEDED',
  attemptNumber: 1,
  createdAt: document.createdAt,
  printerProfileId: null,
};
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}
export const list = (data: unknown[], nextCursor: string | null = null) =>
  json({ data, page: { hasNextPage: nextCursor !== null, nextCursor } });
export const failure = (status: number, code = 'FORBIDDEN') =>
  json({ status, title: 'Request rejected', code }, status);
export function network(
  handler: (
    url: URL,
    init: RequestInit,
    body: Record<string, unknown>,
  ) => Response | Promise<Response>,
) {
  const calls: Array<{ url: URL; method: string; body: Record<string, unknown> }> = [];
  const fetcher = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'https://warehouse.test');
    const body = init.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method: init.method ?? 'GET', body });
    return Promise.resolve(handler(url, init, body));
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, fetcher };
}
// Proposed public component boundaries for T130–T132; no missing-behavior stubs/skips.
export async function mount(
  component: 'DocumentCenter' | 'DocumentHistory' | 'PrintDialog',
  props: Record<string, unknown> = {},
  role: SessionUser['role'] = 'DRIVER',
  path = '/',
) {
  const modules = {
    DocumentCenter: '../../src/features/documents/document-center.js',
    DocumentHistory: '../../src/features/documents/document-history.js',
    PrintDialog: '../../src/features/printers/print-dialog.js',
  };
  const module = await import(modules[component]);
  const Component = module[component] as ComponentType<Record<string, unknown>>;
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <SessionContext.Provider value={{ user: { ...actor, role }, loading: false, error: null }}>
        <MemoryRouter initialEntries={[path]}>
          <Component {...props} />
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}
export function printer(result = 'SUCCEEDED', capability = 'AVAILABLE') {
  const snapshot = { state: 'CONNECTED' };
  return {
    capability: () => capability,
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    test: vi.fn(async () => ({ state: result })),
    print: vi.fn(async () => ({ state: result })),
  };
}

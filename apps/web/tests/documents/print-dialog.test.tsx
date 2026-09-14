import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  acceptedAttempt,
  document,
  source,
  mount,
  printer,
  printNetwork,
  network,
  failure,
  json,
  printData,
} from './document-ui-harness.js';
import { changeAppLanguage } from '../../src/i18n/index.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function startButton(name = /^print$/i) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
it('waits for STARTED acceptance and rejects duplicate clicks while in flight', async () => {
  let accept!: (response: Response) => void;
  let started!: Record<string, unknown>;
  const s = printNetwork((body) =>
    body.state === 'STARTED'
      ? new Promise((resolve) => {
          started = body;
          accept = resolve;
        })
      : acceptedAttempt(body),
  );
  const adapter = printer();
  await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
  const button = await startButton();
  fireEvent.click(button);
  fireEvent.click(button);
  expect(adapter.print).not.toHaveBeenCalled();
  expect(s.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  await act(async () => accept(acceptedAttempt(started)));
  await waitFor(() =>
    expect(screen.getByTestId('document-print-result')).toHaveAttribute('data-state', 'SUCCEEDED'),
  );
  expect(adapter.print).toHaveBeenCalledTimes(1);
  expect(adapter.print.mock.calls[0]).toEqual([
    expect.objectContaining({ snapshot: printData.snapshot }),
    expect.objectContaining({ mode: 'PRINT', bytes: expect.any(Uint8Array) }),
  ]);
});
it('does not start hardware or record under a new session after the panel unmounts', async () => {
  let accept!: (response: Response) => void;
  let started!: Record<string, unknown>;
  const s = printNetwork(
    (body) =>
      new Promise((resolve) => {
        started = body;
        accept = resolve;
      }),
  );
  const adapter = printer();
  const view = await mount('PrintDialog', {
    open: true,
    document,
    source,
    adapter,
    onClose: vi.fn(),
  });
  fireEvent.click(await startButton());
  view.unmount();
  await act(async () => accept(acceptedAttempt(started)));
  expect(adapter.print).not.toHaveBeenCalled();
  expect(s.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
});
it('retries only terminal persistence with the same idempotency key, never the physical print', async () => {
  let terminal = 0;
  const s = printNetwork((body) =>
    body.state !== 'STARTED' && terminal++ === 0 ? failure(500) : acceptedAttempt(body),
  );
  const adapter = printer();
  await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
  fireEvent.click(await startButton());
  fireEvent.click(await startButton(/retry saving result/i));
  await waitFor(() =>
    expect(screen.getByTestId('document-print-result')).toHaveAttribute('data-state', 'SUCCEEDED'),
  );
  expect(adapter.print).toHaveBeenCalledTimes(1);
  const requests = s.fetcher.mock.calls
    .map(([, init]) => init!)
    .filter((init) => init.method === 'POST');
  expect(requests).toHaveLength(3);
  expect(new Headers(requests[1]!.headers).get('Idempotency-Key')).toBe(
    new Headers(requests[2]!.headers).get('Idempotency-Key'),
  );
  expect(requests[1]!.body).toBe(requests[2]!.body);
});
it('requires confirmed REPRINT after reopening with a prior unresolved STARTED', async () => {
  const s = printNetwork(acceptedAttempt, true);
  const adapter = printer();
  await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
  fireEvent.click(await startButton(/^reprint$/i));
  expect(adapter.print).not.toHaveBeenCalled();
  expect(s.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  fireEvent.click(await startButton(/confirm reprint/i));
  await waitFor(() => expect(adapter.print).toHaveBeenCalledTimes(1));
  expect(adapter.print).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ mode: 'REPRINT', confirmed: true }),
  );
});
it.each(['SUCCEEDED', 'FAILED', 'UNKNOWN'])(
  'records API-accepted TEST_PRINT %s without any source reference or mutation',
  async (result) => {
    const s = printNetwork();
    const adapter = printer(result);
    await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
    fireEvent.click(await startButton(/test printer/i));
    await waitFor(() =>
      expect(screen.getByTestId('document-print-result')).toHaveAttribute('data-state', result),
    );
    const posts = s.calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => c.body.state)).toEqual(['STARTED', result]);
    for (const post of posts) {
      expect(post.url.pathname).toBe('/api/v1/output-attempts');
      expect(post.body.mode).toBe('TEST_PRINT');
      expect(post.body).not.toHaveProperty('documentId');
    }
    expect(adapter.test).toHaveBeenCalledTimes(1);
    expect(adapter.print).not.toHaveBeenCalled();
  },
);
it.each([403, 409, 422])('blocks connection when source preflight returns %s', async (status) => {
  network(() => failure(status));
  const adapter = printer();
  await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('button', { name: /connect printer/i })).toBeDisabled();
  expect(adapter.connect).not.toHaveBeenCalled();
  expect(adapter.print).not.toHaveBeenCalled();
});
it('rejects mismatched canonical content before any physical output', async () => {
  network(() => json({ data: { ...printData, contentVersion: 'stale' } }));
  const adapter = printer();
  await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.getByRole('button', { name: /^print$/i })).toBeDisabled();
  expect(adapter.print).not.toHaveBeenCalled();
});
it.each([
  { ...source, driverId: 'another-driver' },
  { ...source, sourceId: crypto.randomUUID() },
  { ...source, documentType: 'ROUTE_LOAD', sourceType: 'ROUTE_LOAD', sourceState: 'DRAFT' },
  { ...source, documentType: 'CASH_CLOSE', sourceType: 'CASH_CLOSE', sourceState: 'CLOSED' },
])(
  'omits unauthorized or unprintable Driver actions without network/device access',
  async (restricted) => {
    const s = printNetwork();
    const adapter = printer();
    await mount('PrintDialog', {
      open: true,
      document,
      source: restricted,
      adapter,
      onClose: vi.fn(),
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(s.calls).toHaveLength(0);
    expect(adapter.connect).not.toHaveBeenCalled();
  },
);
it('translates the print controls and result into Spanish', async () => {
  await changeAppLanguage('es');
  printNetwork();
  await mount('PrintDialog', {
    open: true,
    document,
    source,
    adapter: printer(),
    onClose: vi.fn(),
  });
  fireEvent.click(await startButton(/^imprimir$/i));
  expect(await screen.findByText(/Datos enviados/)).toBeVisible();
  expect(screen.getByRole('button', { name: /^reimprimir$/i })).toBeVisible();
});

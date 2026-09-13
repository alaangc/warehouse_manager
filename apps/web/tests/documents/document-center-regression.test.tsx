import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  actor,
  attempt,
  document,
  failure,
  json,
  list,
  mount,
  network,
  source,
} from './document-ui-harness.js';
import { setCsrfToken } from '../../src/lib/api/client.js';
import i18n from '../../src/i18n/index.js';

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setCsrfToken(null);
  await i18n.changeLanguage('en');
});

it('preserves CSRF and idempotency on an explicit generation retry', async () => {
  setCsrfToken('csrf-test');
  const headers: Headers[] = [];
  network((_url, init) => {
    headers.push(new Headers(init.headers));
    return failure(500);
  });
  await mount('DocumentCenter', { source });
  fireEvent.click(screen.getByRole('button', { name: /generate pdf/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^retry$/i }));
  await waitFor(() => expect(headers).toHaveLength(2));
  expect(headers[0]!.get('Idempotency-Key')).toHaveLength(36);
  expect(headers[1]!.get('Idempotency-Key')).toBe(headers[0]!.get('Idempotency-Key'));
  expect(headers.every((header) => header.get('X-CSRF-Token') === 'csrf-test')).toBe(true);
});

it('stops polling after a status denial and removes output actions', async () => {
  const s = network((_url, init) =>
    init.method === 'POST' ? json({ data: { ...document, state: 'PENDING' } }, 202) : failure(403),
  );
  await mount('DocumentCenter', { source });
  fireEvent.click(screen.getByRole('button', { name: /generate pdf/i }));
  expect(await screen.findByText(/do not have access/i)).toBeVisible();
  const count = s.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 650));
  expect(s.calls).toHaveLength(count);
  expect(
    screen.queryByRole('button', { name: /download|generate|print/i }),
  ).not.toBeInTheDocument();
});

it('recovers a failed status read using GET without resubmitting the source', async () => {
  let fail = true;
  const s = network(() => (fail ? failure(500) : json({ data: document })));
  await mount('DocumentCenter', { documentId: document.id });
  expect(await screen.findByRole('alert')).toBeVisible();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: /refresh status/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /download/i })).toBeEnabled());
  expect(s.calls.every((call) => call.method === 'GET')).toBe(true);
});

it('retries a failed document opened from history with the canonical source', async () => {
  const s = network((_url, init) =>
    json({ data: { ...document, state: init.method === 'POST' ? 'READY' : 'FAILED' } }),
  );
  await mount('DocumentCenter', { documentId: document.id });
  fireEvent.click(await screen.findByRole('button', { name: /^retry$/i }));
  await waitFor(() => expect(s.calls.some((call) => call.method === 'POST')).toBe(true));
  expect(s.calls.find((call) => call.method === 'POST')!.body).toEqual({
    documentType: 'TICKET',
    sourceType: 'SALE',
    sourceId: source.sourceId,
  });
});

it('supports previous and first-page recovery after an invalid cursor', async () => {
  const s = network((url) =>
    url.searchParams.has('cursor')
      ? failure(422, 'CURSOR_INVALID')
      : list([document], 'opaque-cursor'),
  );
  await mount('DocumentHistory', { collection: 'documents' });
  fireEvent.click(await screen.findByRole('button', { name: /next page/i }));
  expect(await screen.findByText(/cursor is no longer valid/i)).toBeVisible();
  expect(screen.queryByText(document.id)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
  expect(await screen.findByText(document.id)).toBeVisible();
  expect(s.calls.at(-1)!.url.searchParams.has('cursor')).toBe(false);
});

it('validates source filters and dates without making a malformed list request', async () => {
  const s = network(() => list([document]));
  await mount('DocumentHistory', { collection: 'documents' }, 'ADMINISTRATOR');
  await screen.findByText(document.id);
  fireEvent.change(screen.getByLabelText('Source ID'), { target: { value: 'not-a-uuid' } });
  fireEvent.click(screen.getByRole('button', { name: /apply filters/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/check the filters/i);
  expect(s.calls).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Source ID'), { target: { value: source.sourceId } });
  fireEvent.change(screen.getByLabelText('Source type'), { target: { value: 'SALE' } });
  fireEvent.click(screen.getByRole('button', { name: /apply filters/i }));
  await waitFor(() =>
    expect(s.calls.at(-1)!.url.searchParams.get('sourceId')).toBe(source.sourceId),
  );
  expect(s.calls.at(-1)!.url.searchParams.get('sourceType')).toBe('SALE');
});

it('does not show cached list metadata in a denied attempt detail', async () => {
  network((url) => (url.pathname.endsWith(attempt.id) ? failure(403) : list([attempt])));
  await mount('DocumentHistory', { collection: 'attempts' });
  fireEvent.click(await screen.findByRole('button', { name: /view attempt/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/do not have access/i);
  expect(screen.getByRole('dialog')).not.toHaveTextContent(attempt.actorId);
});

it('localizes document controls and safely translates unknown server errors', async () => {
  await i18n.changeLanguage('es');
  network(() =>
    json({ status: 500, title: 'private server stack trace', code: 'UNKNOWN_SERVER_CODE' }, 500),
  );
  await mount('DocumentCenter', { source: { ...source, driverId: actor.id } });
  fireEvent.click(screen.getByRole('button', { name: /generar pdf/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la solicitud');
  expect(screen.queryByText(/private server/i)).not.toBeInTheDocument();
});

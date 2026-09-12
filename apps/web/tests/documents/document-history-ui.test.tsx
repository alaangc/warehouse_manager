import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { document, attempt, mount, network, json, list, failure } from './document-ui-harness.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('T121 document and attempt history UI (red until T130)', () => {
  it.each(['documents', 'attempts'] as const)(
    'traverses opaque %s pages and disables Next at the end',
    async (collection) => {
      const row = collection === 'documents' ? document : attempt;
      const second = { ...row, id: '00000000-0000-4000-8000-000000000125' };
      const s = network((url) =>
        list(
          [url.searchParams.has('cursor') ? second : row],
          url.searchParams.has('cursor') ? null : 'opaque-page-2',
        ),
      );
      await mount('DocumentHistory', { collection });
      fireEvent.click(await screen.findByRole('button', { name: /^next/i }));
      await waitFor(() =>
        expect(
          s.calls.some((call) => call.url.searchParams.get('cursor') === 'opaque-page-2'),
        ).toBe(true),
      );
      await waitFor(() => expect(screen.getByRole('button', { name: /^next/i })).toBeDisabled());
      expect(s.calls.every((call) => call.method === 'GET')).toBe(true);
    },
  );

  it('clears the previous cursor when document filters change', async () => {
    const s = network((url) =>
      list([document], url.searchParams.has('cursor') ? null : 'old-scope-cursor'),
    );
    await mount('DocumentHistory', { collection: 'documents' }, 'ADMINISTRATOR');
    fireEvent.click(await screen.findByRole('button', { name: /^next/i }));
    await waitFor(() =>
      expect(s.calls.at(-1)!.url.searchParams.get('cursor')).toBe('old-scope-cursor'),
    );
    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'REPORT' } });
    fireEvent.click(screen.getByRole('button', { name: /apply filters/i }));
    await waitFor(() =>
      expect(s.calls.at(-1)!.url.searchParams.get('documentType')).toBe('REPORT'),
    );
    expect(s.calls.at(-1)!.url.searchParams.has('cursor')).toBe(false);
  });

  it('submits attempt document/mode/state/time filters and opens attempt detail', async () => {
    const s = network((url) =>
      url.pathname.endsWith(`/${attempt.id}`) ? json({ data: attempt }) : list([attempt]),
    );
    await mount('DocumentHistory', { collection: 'attempts' }, 'ADMINISTRATOR');
    fireEvent.change(await screen.findByLabelText('Document ID'), {
      target: { value: document.id },
    });
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'DOWNLOAD' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'SUCCEEDED' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01T00:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: /apply filters/i }));
    await waitFor(() =>
      expect(s.calls.at(-1)!.url.searchParams.get('documentId')).toBe(document.id),
    );
    expect(s.calls.at(-1)!.url.searchParams.get('mode')).toBe('DOWNLOAD');
    expect(s.calls.at(-1)!.url.searchParams.get('state')).toBe('SUCCEEDED');
    expect(s.calls.at(-1)!.url.searchParams.get('from')).toBeTruthy();
    expect(s.calls.at(-1)!.url.searchParams.get('to')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /view attempt/i }));
    await waitFor(() =>
      expect(s.calls.some((call) => call.url.pathname.endsWith(`/${attempt.id}`))).toBe(true),
    );
    expect(await screen.findByRole('dialog')).toHaveTextContent(attempt.actorId);
  });

  it.each(['documents', 'attempts'] as const)(
    'shows an explicit empty %s state',
    async (collection) => {
      network(() => list([]));
      await mount('DocumentHistory', { collection });
      expect(await screen.findByText(/no documents|no output attempts|no history/i)).toBeVisible();
    },
  );

  it.each([403, 422, 500])('shows safe history error %s instead of stale rows', async (status) => {
    network(() => failure(status, status === 422 ? 'INVALID_CURSOR' : 'FORBIDDEN'));
    await mount('DocumentHistory', { collection: 'documents' });
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText(document.id)).not.toBeInTheDocument();
  });

  it('shows Administrator TEST_PRINT history but never offers that filter to Drivers', async () => {
    network(() => list([{ ...attempt, documentId: null, mode: 'TEST_PRINT' }]));
    const admin = await mount('DocumentHistory', { collection: 'attempts' }, 'ADMINISTRATOR');
    expect(await screen.findByRole('option', { name: /test print/i })).toBeVisible();
    admin.unmount();
    network(() => list([]));
    await mount('DocumentHistory', { collection: 'attempts' });
    await screen.findByLabelText('Mode');
    expect(screen.queryByRole('option', { name: /test print/i })).not.toBeInTheDocument();
  });

  it('does not hide an authorized document or attempt merely because an Administrator created it', async () => {
    network(() => list([document]));
    const docs = await mount('DocumentHistory', { collection: 'documents' });
    expect(await screen.findByRole('button', { name: /view document/i })).toBeVisible();
    docs.unmount();
    network(() => list([attempt]));
    await mount('DocumentHistory', { collection: 'attempts' });
    expect(await screen.findByRole('button', { name: /view attempt/i })).toBeVisible();
  });

  it.each(['CASH_CLOSE', 'REPORT'])(
    'omits Driver %s filters and honors server denial for a manipulated source',
    async (type) => {
      const s = network(() => failure(403));
      await mount(
        'DocumentHistory',
        { collection: 'documents' },
        'DRIVER',
        `/documents?documentType=${type}&sourceId=forbidden-source`,
      );
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(
        screen.queryByRole('option', {
          name: new RegExp(type === 'REPORT' ? 'report' : 'cash close', 'i'),
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /download|print|share/i }),
      ).not.toBeInTheDocument();
      expect(s.calls.every((call) => call.method === 'GET')).toBe(true);
    },
  );
});

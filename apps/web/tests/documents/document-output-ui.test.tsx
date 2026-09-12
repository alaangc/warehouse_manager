import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { document, source, mount, network, json, failure, printer } from './document-ui-harness.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('T121 document output UI (red until T130–T132)', () => {
  it('requests canonical output, polls PENDING until READY and enables download without repeating the sale', async () => {
    let reads = 0;
    const s = network((url, init) => {
      if (url.pathname === '/api/v1/documents' && init.method === 'POST')
        return json({ data: { ...document, state: 'PENDING' } }, 202);
      if (url.pathname === `/api/v1/documents/${document.id}`)
        return json({ data: { ...document, state: ++reads > 1 ? 'READY' : 'PENDING' } });
      return failure(500);
    });
    await mount('DocumentCenter', { source });
    fireEvent.click(await screen.findByRole('button', { name: /generate pdf/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /download/i })).toBeEnabled(), {
      timeout: 5_000,
    });
    expect(reads).toBeGreaterThan(1);
    const commands = s.calls.filter((call) => call.method === 'POST');
    expect(commands).toHaveLength(1);
    expect(commands[0]!.body).toEqual({
      documentType: 'TICKET',
      sourceType: 'SALE',
      sourceId: source.sourceId,
    });
  });

  it.each([403, 409, 500])(
    'shows generation failure %s and does not silently retry',
    async (status) => {
      const s = network(() => failure(status));
      await mount('DocumentCenter', { source });
      fireEvent.click(await screen.findByRole('button', { name: /generate pdf/i }));
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(s.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
      const download = screen.queryByRole('button', { name: /download/i });
      if (download) expect(download).toBeDisabled();
    },
  );

  it('offers an explicit retry for FAILED generation, reusing the source rather than business commands', async () => {
    const s = network(() =>
      json(
        { data: { ...document, state: 'FAILED', lastErrorCode: 'DOCUMENT_GENERATION_FAILED' } },
        202,
      ),
    );
    await mount('DocumentCenter', { source });
    fireEvent.click(await screen.findByRole('button', { name: /generate pdf/i }));
    fireEvent.click(await screen.findByRole('button', { name: /retry/i }));
    await waitFor(() => expect(s.calls.filter((call) => call.method === 'POST')).toHaveLength(2));
    expect(s.calls.every((call) => call.url.pathname.startsWith('/api/v1/documents'))).toBe(true);
  });

  it('downloads the PDF with a stable filename and falls back when sharing is unsupported', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const nativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends nativeURL {
        static createObjectURL = vi.fn(() => 'blob:test-pdf');
        static revokeObjectURL = vi.fn();
      },
    );
    vi.stubGlobal('navigator', { canShare: () => false });
    network((url) =>
      url.pathname.endsWith('/content')
        ? new Response('%PDF-fixture', {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="ticket-123.pdf"',
            },
          })
        : json({ data: document }, 202),
    );
    await mount('DocumentCenter', { source });
    fireEvent.click(await screen.findByRole('button', { name: /generate pdf/i }));
    fireEvent.click(await screen.findByRole('button', { name: /download/i }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(click.mock.instances[0]).toHaveAttribute('download', 'ticket-123.pdf');
    expect(screen.queryByRole('button', { name: /^share/i })).not.toBeInTheDocument();
  });

  it('shares only on user action when the browser accepts PDF files', async () => {
    const share = vi.fn(async (_data: ShareData) => {
      void _data;
    });
    vi.stubGlobal('navigator', { canShare: () => true, share });
    network((url) =>
      url.pathname.endsWith('/content')
        ? new Response('%PDF-fixture', {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="ticket-123.pdf"',
            },
          })
        : json({ data: document }, 202),
    );
    await mount('DocumentCenter', { source });
    fireEvent.click(await screen.findByRole('button', { name: /generate pdf/i }));
    const button = await screen.findByRole('button', { name: /^share/i });
    expect(share).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]![0]).toMatchObject({ files: [expect.any(File)] });
  });

  it.each([
    { ...source, documentType: 'CASH_CLOSE', sourceType: 'CASH_CLOSE' },
    { ...source, documentType: 'REPORT', sourceType: 'REPORT_SNAPSHOT' },
    { ...source, driverId: 'another-driver' },
    { ...source, documentType: 'ROUTE_LOAD', sourceType: 'ROUTE_LOAD', sourceState: 'DRAFT' },
  ])('omits forbidden or draft source actions: $documentType/$sourceState', async (restricted) => {
    const s = network(() => failure(403));
    await mount('DocumentCenter', { source: restricted });
    expect(
      screen.queryByRole('button', { name: /generate|download|share|print/i }),
    ).not.toBeInTheDocument();
    expect(s.calls).toEqual([]);
  });
});

describe('T121 print acceptance and uncertainty UI', () => {
  it.each([403, 409, 422, 500])(
    'does not touch hardware when API acceptance returns %s',
    async (status) => {
      const adapter = printer();
      network(() => failure(status));
      await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
      fireEvent.click(await screen.findByRole('button', { name: /^print$/i }));
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(adapter.print).not.toHaveBeenCalled();
    },
  );
  it('waits for accepted STARTED, records UNKNOWN and requires explicit reprint without resubmitting a sale', async () => {
    const adapter = printer('UNKNOWN');
    const s = network((_url, _init, body) =>
      json({ data: { id: crypto.randomUUID(), ...body } }, 201),
    );
    await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
    fireEvent.click(await screen.findByRole('button', { name: /^print$/i }));
    expect(await screen.findByText(/unknown|may have printed/i)).toBeVisible();
    expect(adapter.print).toHaveBeenCalledTimes(1);
    expect(s.calls.map((call) => call.body.state)).toEqual(['STARTED', 'UNKNOWN']);
    fireEvent.click(screen.getByRole('button', { name: /reprint/i }));
    expect(adapter.print).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: /confirm reprint/i }));
    await waitFor(() => expect(adapter.print).toHaveBeenCalledTimes(2));
    expect(s.calls.every((call) => call.url.pathname === '/api/v1/output-attempts')).toBe(true);
    expect(s.calls.at(-1)!.body.mode).toBe('REPRINT');
  });
  it('offers download fallback when Bluetooth is unsupported', async () => {
    const adapter = printer('FAILED', 'UNSUPPORTED');
    await mount('PrintDialog', { open: true, document, source, adapter, onClose: vi.fn() });
    expect(await screen.findByText(/unsupported|not supported/i)).toBeVisible();
    const print = screen.queryByRole('button', { name: /^print$/i });
    if (print) expect(print).toBeDisabled();
    expect(screen.getByRole('button', { name: /download/i })).toBeVisible();
    expect(adapter.print).not.toHaveBeenCalled();
  });
  it('does not offer Administrator REPORT printing', async () => {
    const adapter = printer();
    await mount(
      'PrintDialog',
      {
        open: true,
        document: { ...document, documentType: 'REPORT' },
        source: { ...source, documentType: 'REPORT' },
        adapter,
        onClose: vi.fn(),
      },
      'ADMINISTRATOR',
    );
    expect(screen.queryByRole('button', { name: /^print$|reprint/i })).not.toBeInTheDocument();
    expect(adapter.print).not.toHaveBeenCalled();
  });
});

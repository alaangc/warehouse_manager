import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { document, failure, mount, network } from './document-ui-harness.js';
import { fetchDocumentFile, saveDocumentFile } from '../../src/features/documents/document-api.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function pdf(filename = 'ticket-123.pdf') {
  return new Response('%PDF-canonical-content', {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
function downloadMocks() {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const native = URL;
  const create = vi.fn(() => 'blob:canonical');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends native {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  return { click, create, revoke };
}

it('prepares only authorized bytes and calls native share synchronously from the click', async () => {
  const share = vi.fn(async () => {});
  const canShare = vi.fn(() => true);
  vi.stubGlobal('navigator', { share, canShare });
  const s = network(() => pdf());
  await mount('DocumentActions', { document });
  const button = await screen.findByRole('button', { name: 'Share PDF' });
  expect(share).not.toHaveBeenCalled();
  expect(s.calls).toHaveLength(1);
  fireEvent.click(button);
  expect(share).toHaveBeenCalledTimes(1);
  expect(s.calls).toHaveLength(1);
  expect(canShare.mock.calls.length).toBeGreaterThan(1);
  expect(await screen.findByRole('status')).toHaveTextContent(/handed to the share target/i);
});

it.each(['missing', 'false', 'throws'])(
  'keeps download fallback when canShare is %s',
  async (kind) => {
    const share = vi.fn();
    vi.stubGlobal(
      'navigator',
      kind === 'missing'
        ? {}
        : {
            share,
            canShare: () => {
              if (kind === 'throws') throw new Error('unsupported');
              return false;
            },
          },
    );
    const { click } = downloadMocks();
    const s = network(() => pdf());
    await mount('DocumentActions', { document });
    expect(s.calls).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Share PDF' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(click.mock.instances[0]).toHaveAttribute('download', 'ticket-123.pdf');
    expect(share).not.toHaveBeenCalled();
    expect(s.calls.every((call) => call.method === 'GET')).toBe(true);
  },
);

it('does not share when the actual file fails canShare even if the probe succeeds', async () => {
  const share = vi.fn();
  vi.stubGlobal('navigator', { share, canShare: ({ files }: ShareData) => files?.[0]?.size === 0 });
  const s = network(() => pdf());
  await mount('DocumentActions', { document });
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  expect(s.calls).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Share PDF' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  expect(share).not.toHaveBeenCalled();
});

it.each(['AbortError', 'NotAllowedError', 'DataError'])(
  'handles %s without automatically sharing again or downloading',
  async (name) => {
    const share = vi.fn(async () => {
      throw new DOMException('native private detail', name);
    });
    vi.stubGlobal('navigator', { share, canShare: () => true });
    const { click } = downloadMocks();
    network(() => pdf());
    await mount('DocumentActions', { document });
    fireEvent.click(await screen.findByRole('button', { name: 'Share PDF' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      name === 'AbortError' ? 'Sharing cancelled.' : 'Sharing is unavailable.',
    );
    expect(share).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
  },
);

it('prevents simultaneous native share dialogs', async () => {
  let finish!: () => void;
  const share = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('navigator', { share, canShare: () => true });
  network(() => pdf());
  await mount('DocumentActions', { document });
  const button = await screen.findByRole('button', { name: 'Share PDF' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(share).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  finish();
  await waitFor(() => expect(button).toBeEnabled());
});

it.each([403, 409, 500])('does not output bytes after content rejection %s', async (status) => {
  const share = vi.fn();
  vi.stubGlobal('navigator', { share, canShare: () => true });
  const { click } = downloadMocks();
  network(() => failure(status));
  await mount('DocumentActions', { document });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Share PDF' })).not.toBeInTheDocument();
  expect(share).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
});

it('cancels a pending download when the view unmounts', async () => {
  vi.stubGlobal('navigator', {});
  const { click } = downloadMocks();
  let resolve!: (response: Response) => void;
  let signal!: AbortSignal;
  network((_url, init) => {
    signal = init.signal!;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const view = await mount('DocumentActions', { document });
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  view.unmount();
  expect(signal.aborted).toBe(true);
  resolve(pdf());
  await new Promise((done) => setTimeout(done, 20));
  expect(click).not.toHaveBeenCalled();
});

it('does not fetch content for PENDING or FAILED documents', async () => {
  vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => true });
  const s = network(() => pdf());
  const first = await mount('DocumentActions', { document: { ...document, state: 'PENDING' } });
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  first.unmount();
  await mount('DocumentActions', { document: { ...document, state: 'FAILED' } });
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  expect(s.calls).toHaveLength(0);
});

it('retains exact PDF bytes and uses a safe filename fallback', async () => {
  network(() => pdf('../../unsafe.pdf'));
  const file = await fetchDocumentFile(document.id, new AbortController().signal);
  expect(file.name).toBe(`document-${document.id}.pdf`);
  expect(file.type).toBe('application/pdf');
  expect(file.size).toBe('%PDF-canonical-content'.length);
});

it('removes temporary links and revokes their object URLs', () => {
  vi.useFakeTimers();
  const { click, create, revoke } = downloadMocks();
  saveDocumentFile(new File(['%PDF-file'], 'receipt.pdf', { type: 'application/pdf' }));
  expect(click).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledTimes(1);
  expect(window.document.querySelector('a[download]')).toBeNull();
  vi.advanceTimersByTime(1_000);
  expect(revoke).toHaveBeenCalledWith('blob:canonical');
});

it.each(['text/html', 'application/pdf'])(
  'rejects invalid PDF bytes with %s content type',
  async (type) => {
    network(() => new Response('<html>not a PDF</html>', { headers: { 'Content-Type': type } }));
    await expect(fetchDocumentFile(document.id, new AbortController().signal)).rejects.toThrow(
      'DOCUMENT_CONTENT_INVALID',
    );
  },
);

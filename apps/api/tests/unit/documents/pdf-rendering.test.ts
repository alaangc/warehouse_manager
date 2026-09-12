import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Proposed T125 boundary: immutable source in, canonical PDF bytes and metadata out.
// Dynamic loading keeps every red-phase case discoverable before T125 exists.
const rendererPath = '../../../src/modules/documents/pdf-renderers.js';
async function render(source: Record<string, unknown>) {
  const { renderDocumentPdf } = await import(rendererPath);
  return renderDocumentPdf(source) as Promise<{
    bytes: Buffer;
    filename: string;
    contentHash: string;
    contentType: string;
  }>;
}
const id = '00000000-0000-4000-8000-000000000118';
const line = {
  productName: 'Piñata café',
  unitCode: 'PZA',
  quantity: '2.000',
  unitPrice: '10.0050',
  lineAmount: '20.01',
};
const common = {
  sourceId: id,
  contentVersion: '1',
  createdAt: '2026-09-11T12:00:00.000Z',
  locale: 'es',
  currencyCode: 'MXN',
  businessTimezone: 'America/Hermosillo',
};
const sources = [
  {
    ...common,
    documentType: 'TICKET',
    sourceType: 'SALE',
    state: 'COMPLETED',
    snapshot: { ticketNumber: 'T-118', saleNumber: 'S-118', lines: [line], total: '20.01' },
  },
  {
    ...common,
    documentType: 'ROUTE_LOAD',
    sourceType: 'ROUTE_LOAD',
    state: 'CONFIRMED',
    snapshot: { loadNumber: 'L-118', routeNumber: 'R-118', lines: [line] },
  },
  {
    ...common,
    documentType: 'CASH_CLOSE',
    sourceType: 'CASH_CLOSE',
    state: 'CLOSED',
    snapshot: {
      closeNumber: 'C-118',
      grossTotal: '20.01',
      expensesTotal: '0.00',
      netTotal: '20.01',
      partnerShare: '10.01',
      ownerShare: '10.00',
    },
  },
  {
    ...common,
    documentType: 'REPORT',
    sourceType: 'REPORT_SNAPSHOT',
    state: 'READY',
    snapshot: { reportType: 'SALES', grossTotal: '20.01', rows: [line] },
  },
];
afterEach(() => vi.restoreAllMocks());

describe('T118 canonical PDF rendering (T125 red phase)', () => {
  it('matches the four committed PDF content snapshots', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    const snapshots: Record<string, string[]> = {};
    const markers = [
      'T-118',
      'S-118',
      'L-118',
      'R-118',
      'C-118',
      'Piñata café',
      '20.01',
      '10.01',
      '10.00',
    ];
    for (const source of sources) {
      text.mockClear();
      await render(source);
      const content = text.mock.calls.map(([value]) => String(value)).join('\n');
      snapshots[source.documentType] = markers.filter((marker) => content.includes(marker));
    }
    expect(snapshots).toMatchInlineSnapshot(`
      {
        "CASH_CLOSE": [
          "C-118",
          "20.01",
          "10.01",
          "10.00",
        ],
        "REPORT": [
          "Piñata café",
          "20.01",
        ],
        "ROUTE_LOAD": [
          "L-118",
          "R-118",
          "Piñata café",
        ],
        "TICKET": [
          "T-118",
          "S-118",
          "Piñata café",
          "20.01",
        ],
      }
    `);
  });
  it.each(sources)(
    '$documentType renders a real PDF and its historical content snapshot',
    async (source) => {
      // Observe real PDFKit text calls without replacing the PDF writer. This avoids
      // snapshots of volatile PDF object offsets while still requiring actual bytes.
      const text = vi.spyOn(PDFDocument.prototype, 'text');
      const result = await render(structuredClone(source));
      expect(result.bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(result.bytes.toString('latin1')).toContain('%%EOF');
      expect(result.contentType).toBe('application/pdf');
      const rendered = text.mock.calls.map(([value]) => String(value)).join('\n');
      const expected = {
        TICKET: ['T-118', 'S-118', 'Piñata café', '2.000', '10.0050', '20.01'],
        ROUTE_LOAD: ['L-118', 'R-118', 'Piñata café', '2.000'],
        CASH_CLOSE: ['C-118', '20.01', '0.00', '10.01', '10.00'],
        REPORT: ['Piñata café', '20.01'],
      }[source.documentType]!;
      // Committed semantic snapshots: absence, rounding or loss of historical fields fails.
      expect(expected.map((value) => ({ value, present: rendered.includes(value) }))).toEqual(
        expected.map((value) => ({ value, present: true })),
      );
    },
  );

  it.each(sources)(
    '$documentType has stable safe filenames and SHA-256 of actual bytes',
    async (source) => {
      const before = structuredClone(source);
      const first = await render(source);
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2035-01-01T00:00:00Z'));
      const second = await render(structuredClone(source));
      expect(second.bytes).toEqual(first.bytes);
      expect(second.filename).toBe(first.filename);
      expect(first.filename).toMatch(/^[a-zA-Z0-9._-]+\.pdf$/);
      expect(first.filename).toContain(id);
      expect(first.contentHash).toBe(createHash('sha256').update(first.bytes).digest('hex'));
      expect(second.contentHash).toBe(first.contentHash);
      expect(source).toEqual(before);
    },
  );

  it('hash changes when historical content changes and preserves large exact values', async () => {
    const original = sources[0]!;
    const changed = {
      ...original,
      snapshot: { ...original.snapshot, total: '9007199254740993.21' },
    };
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    const first = await render(original);
    const second = await render(changed);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(text.mock.calls.map(([value]) => String(value)).join('\n')).toContain(
      '9007199254740993.21',
    );
  });

  it('renders user text literally and keeps path/control characters out of filenames', async () => {
    const label = '../José (café) <script>alert(1)</script> \\ tienda';
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    const result = await render({
      ...sources[0],
      snapshot: {
        ...sources[0]!.snapshot,
        ticketNumber: '../../ticket\r\n',
        lines: [{ ...line, productName: label }],
      },
    });
    expect(text.mock.calls.map(([value]) => String(value)).join('\n')).toContain(label);
    expect(result.filename).not.toMatch(/[\\/\r\n]/);
    expect(result.filename).not.toContain('..');
  });

  it('rejects a draft route load before rendering', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await expect(render({ ...sources[1], state: 'DRAFT' })).rejects.toMatchObject({ status: 409 });
    expect(text).not.toHaveBeenCalled();
  });
  it('rejects an invalid document/source pair', async () => {
    await expect(render({ ...sources[0], sourceType: 'REPORT_SNAPSHOT' })).rejects.toMatchObject({
      status: 422,
    });
  });
});

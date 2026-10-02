import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Immutable source in, canonical PDF bytes and metadata out.
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('T118/T125 canonical PDF rendering', () => {
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
      snapshots[source.documentType] = markers.filter((marker) =>
        /^\d+\.\d+$/.test(marker)
          ? new RegExp(`(?<![\\d.])${marker.replace('.', '\\.')}(?![\\d.])`).test(content)
          : content.includes(marker),
      );
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

  it('keeps bytes stable when the actual wall clock and input key order change', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    const first = await render(sources[0]!);
    vi.setSystemTime(new Date('2039-07-08T12:34:56Z'));
    const reordered = Object.fromEntries(Object.entries(sources[0]!).reverse());
    expect((await render(reordered)).bytes).toEqual(first.bytes);
  });

  it.each([undefined, 'DRAFT'])(
    'requires an explicitly confirmed load state (%s)',
    async (state) => {
      const text = vi.spyOn(PDFDocument.prototype, 'text');
      await expect(render({ ...sources[1], state })).rejects.toMatchObject({ status: 409 });
      expect(text).not.toHaveBeenCalled();
    },
  );

  it('rejects binary monetary values before writing a PDF', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await expect(
      render({ ...sources[0], snapshot: { ...sources[0]!.snapshot, total: 9007199254740992 } }),
    ).rejects.toMatchObject({ status: 422 });
    expect(text).not.toHaveBeenCalled();
  });

  it.each([
    {
      reportType: 'SALES_BY_DRIVER',
      row: { driverName: 'José Muñoz', saleCount: '5', total: '9007199254740993.21' },
      marker: 'José Muñoz',
    },
    {
      reportType: 'BEST_SELLING_PRODUCTS',
      row: { productName: 'Café histórico', quantity: '123.456', total: '9007199254740993.21' },
      marker: 'Café histórico',
    },
    {
      reportType: 'INVENTORY_BY_BRANCH',
      row: {
        branchName: 'Magdalena',
        branchCode: 'MAG',
        productName: 'Carbón',
        quantity: '123.456',
        unitCode: 'KG',
      },
      marker: 'Magdalena',
    },
    {
      reportType: 'FINANCIAL_SUMMARY',
      row: { reportingGroup: 'CHARCOAL', total: '9007199254740993.21' },
      marker: 'CHARCOAL',
    },
  ])('renders repository-shaped $reportType snapshots', async ({ reportType, row, marker }) => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await render({
      ...sources[3],
      snapshot: {
        reportType,
        result: {
          reportType,
          rows: [row],
          filters: { periodStart: '2026-09-01T07:00:00Z', periodEnd: '2026-10-01T07:00:00Z' },
          totals: {
            grossTotal: '9007199254740993.21',
            partnerAmount: '4503599627370496.61',
            remainingAmount: '4503599627370496.60',
          },
        },
      },
    });
    const rendered = text.mock.calls.map(([value]) => String(value)).join('\n');
    for (const value of [
      marker,
      '9007199254740993.21',
      '4503599627370496.61',
      '4503599627370496.60',
      '2026-10-01T07:00:00Z',
    ])
      expect(rendered).toContain(value);
  });

  it('renders the repository cash-close snapshot and preserves correction history', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await render({
      ...sources[2],
      snapshot: {
        closeNumber: 'C-HISTORICO',
        currencyCode: 'MXN',
        grossTotal: '20.01',
        partnerRate: '0.500000',
        partnerShare: '10.01',
        ownerShare: '10.00',
        supersedesCashCloseId: id,
        correctionReason: 'Corrección de carbón',
        lines: [{ reportingGroup: 'CHARCOAL', total: '20.01' }],
      },
    });
    const rendered = text.mock.calls.map(([value]) => String(value)).join('\n');
    for (const value of ['C-HISTORICO', 'CHARCOAL', '0.500000', 'Corrección de carbón'])
      expect(rendered).toContain(value);
  });

  it('paginates many rows and retains first/last data with numbered pages', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    const result = await render({
      ...sources[0],
      snapshot: {
        ...sources[0]!.snapshot,
        lines: Array.from({ length: 90 }, (_, index) => ({
          ...line,
          productName: `Producto ${index}: Piñata café`,
        })),
      },
    });
    const pageCount = [...result.bytes.toString('latin1').matchAll(/\/Type \/Page\b/g)].length;
    expect(pageCount).toBeGreaterThan(1);
    const rendered = text.mock.calls.map(([value]) => String(value)).join('\n');
    expect(rendered).toContain('Producto 0: Piñata café');
    expect(rendered).toContain('Producto 89: Piñata café');
    expect(rendered).toContain(`Página ${pageCount} / ${pageCount}`);
  });

  it('flows oversized records instead of truncating text and supports empty reports', async () => {
    const text = vi.spyOn(PDFDocument.prototype, 'text');
    await render({
      ...sources[0],
      snapshot: {
        ...sources[0]!.snapshot,
        lines: [
          { ...line, productName: `${'Descripción larga de café. '.repeat(400)}FIN DEL PRODUCTO` },
        ],
      },
    });
    expect(text.mock.calls.map(([value]) => String(value)).join('\n')).toContain(
      'FIN DEL PRODUCTO',
    );
    text.mockClear();
    await render({ ...sources[3], snapshot: { reportType: 'FINANCIAL_SUMMARY', rows: [] } });
    expect(text.mock.calls.map(([value]) => String(value)).join('\n')).toContain('Sin registros');
  });

  it('propagates a writer failure without returning a partial success', async () => {
    vi.spyOn(PDFDocument.prototype, 'text').mockImplementationOnce(() => {
      throw new Error('PDF writer failed');
    });
    await expect(render(sources[0]!)).rejects.toThrow('PDF writer failed');
  });
});

import { RouteReturnSnapshotSchema } from '@warehouse/contracts';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { HttpProblem } from '../../http/problem-handler.js';
import { sourcePairs } from './document-repository.js';

const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const text = z.string();
const lineSchema = z.object({
  productName: text,
  unitCode: text,
  quantity: decimal,
  unitPrice: decimal.optional(),
  lineAmount: decimal.optional(),
});
const ticketSchema = z.object({
  ticketNumber: text,
  saleNumber: text,
  lines: z.array(lineSchema.extend({ unitPrice: decimal, lineAmount: decimal })),
  total: decimal,
  currencyCode: text.optional(),
  paymentMethod: text.optional(),
});
const loadSchema = z.object({ loadNumber: text, routeNumber: text, lines: z.array(lineSchema) });
const periodFields = {
  periodKind: text.optional(),
  anchorDate: text.optional(),
  periodStart: text.optional(),
  periodEnd: text.optional(),
};
const totalsFields = {
  currencyCode: text.optional(),
  grossTotal: decimal.optional(),
  expensesTotal: decimal.optional(),
  netTotal: decimal.optional(),
  partnerRate: decimal.optional(),
  partnerShare: decimal.optional(),
  partnerAmount: decimal.optional(),
  ownerShare: decimal.optional(),
  remainingAmount: decimal.optional(),
};
const cashSchema = z.object({
  closeNumber: text,
  ...periodFields,
  ...totalsFields,
  grossTotal: decimal,
  partnerShare: decimal,
  ownerShare: decimal,
  businessTimezone: text.optional(),
  correctionReason: text.nullable().optional(),
  supersedesCashCloseId: text.nullable().optional(),
  lines: z.array(z.object({ reportingGroup: text, total: decimal })).optional(),
});
const reportRowSchema = z.object({
  driverName: text.optional(),
  saleCount: decimal.optional(),
  productName: text.optional(),
  branchName: text.optional(),
  branchCode: text.optional(),
  reportingGroup: text.optional(),
  unitCode: text.optional(),
  quantity: decimal.optional(),
  unitPrice: decimal.optional(),
  lineAmount: decimal.optional(),
  total: decimal.optional(),
});
const reportSchema = z.object({
  reportType: text,
  rows: z.array(reportRowSchema),
  grossTotal: decimal.optional(),
  businessTimezone: text.optional(),
  filters: z.object(periodFields).optional(),
  totals: z.object(totalsFields).optional(),
});
const sourceSchema = z.object({
  documentType: z.enum(['TICKET', 'ROUTE_LOAD', 'ROUTE_RETURN', 'CASH_CLOSE', 'REPORT']),
  sourceType: z.enum(['SALE', 'ROUTE_LOAD', 'ROUTE_RETURN', 'CASH_CLOSE', 'REPORT_SNAPSHOT']),
  sourceId: z.uuid(),
  contentVersion: text.min(1),
  createdAt: z.iso.datetime({ offset: true }),
  state: text.optional(),
  locale: z.enum(['es', 'en']).default('es'),
  currencyCode: text.optional(),
  businessTimezone: text.optional(),
  snapshot: z.record(z.string(), z.unknown()),
});
export type PdfSource = z.input<typeof sourceSchema>;
export interface RenderedDocumentPdf {
  bytes: Buffer;
  filename: string;
  contentHash: string;
  contentType: 'application/pdf';
}

export function documentContentVersion(sourceVersion: string, documentType?: string): string {
  // The same thermal layout version applies to every supported source type.
  void documentType;
  return `${sourceVersion}:pdf-thermal-58mm-v3`;
}

export function documentPdfFilename(source: {
  documentType: string;
  sourceId: string;
  contentVersion: string;
}): string {
  const version = createHash('sha256').update(source.contentVersion).digest('hex').slice(0, 12);
  return `${source.documentType.toLowerCase()}-${source.sourceId.toLowerCase()}-v${version}.pdf`;
}

const labels = {
  es: {
    TICKET: 'Ticket de venta',
    ROUTE_LOAD: 'Carga de ruta',
    ROUTE_RETURN: 'Devolución de ruta',
    returnKind: 'Estado de devolución',
    expectedQuantity: 'Esperado',
    differenceQuantity: 'Diferencia',
    differenceReason: 'Motivo de diferencia',
    CASH_CLOSE: 'Corte de caja',
    REPORT: 'Reporte',
    ticketNumber: 'Ticket',
    saleNumber: 'Venta',
    loadNumber: 'Carga',
    routeNumber: 'Ruta',
    closeNumber: 'Corte',
    createdAt: 'Fecha de origen (UTC)',
    currencyCode: 'Moneda',
    businessTimezone: 'Zona horaria',
    paymentMethod: 'Forma de pago',
    productName: 'Producto',
    quantity: 'Cantidad',
    unitCode: 'Unidad',
    unitPrice: 'Precio unitario',
    lineAmount: 'Importe',
    total: 'Total',
    grossTotal: 'Ventas brutas',
    expensesTotal: 'Gastos',
    netTotal: 'Total neto',
    partnerRate: 'Tasa del socio',
    partnerShare: 'Parte del socio',
    partnerAmount: 'Parte del socio',
    ownerShare: 'Remanente',
    remainingAmount: 'Remanente',
    periodKind: 'Periodo',
    anchorDate: 'Fecha del periodo',
    periodStart: 'Desde',
    periodEnd: 'Hasta (exclusivo)',
    correctionReason: 'Motivo de corrección',
    supersedesCashCloseId: 'Corte anterior',
    reportingGroup: 'Grupo',
    driverName: 'Chofer',
    saleCount: 'Ventas',
    branchName: 'Sucursal',
    branchCode: 'Clave',
    reportType: 'Tipo de reporte',
    empty: 'Sin registros',
    page: 'Página',
  },
  en: {
    TICKET: 'Sale ticket',
    ROUTE_LOAD: 'Route load',
    ROUTE_RETURN: 'Route return',
    returnKind: 'Return status',
    expectedQuantity: 'Expected',
    differenceQuantity: 'Difference',
    differenceReason: 'Difference reason',
    CASH_CLOSE: 'Cash close',
    REPORT: 'Report',
    ticketNumber: 'Ticket',
    saleNumber: 'Sale',
    loadNumber: 'Load',
    routeNumber: 'Route',
    closeNumber: 'Close',
    createdAt: 'Source date (UTC)',
    currencyCode: 'Currency',
    businessTimezone: 'Timezone',
    paymentMethod: 'Payment method',
    productName: 'Product',
    quantity: 'Quantity',
    unitCode: 'Unit',
    unitPrice: 'Unit price',
    lineAmount: 'Amount',
    total: 'Total',
    grossTotal: 'Gross sales',
    expensesTotal: 'Expenses',
    netTotal: 'Net total',
    partnerRate: 'Partner rate',
    partnerShare: 'Partner share',
    partnerAmount: 'Partner share',
    ownerShare: 'Remaining amount',
    remainingAmount: 'Remaining amount',
    periodKind: 'Period',
    anchorDate: 'Period date',
    periodStart: 'From',
    periodEnd: 'To (exclusive)',
    correctionReason: 'Correction reason',
    supersedesCashCloseId: 'Previous close',
    reportingGroup: 'Group',
    driverName: 'Driver',
    saleCount: 'Sales',
    branchName: 'Branch',
    branchCode: 'Code',
    reportType: 'Report type',
    empty: 'No records',
    page: 'Page',
  },
} as const;
type Label = keyof typeof labels.es;
interface ThermalLayout {
  field(key: Label, value: string | null | undefined, emphasized?: boolean): void;
  table(columns: Column[], rows: Array<Partial<Record<Label, string | undefined>>>): void;
}
type Column = { key: Label; width: number; numeric?: boolean };
const contentWidth = 507.28;

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpProblem(422, 'INVALID_DOCUMENT_SNAPSHOT', 'Invalid document snapshot');
  return result.data;
}

/** PDFKit escapes PDF string syntax. Never interpret business text as HTML or PDF commands. */
function literal(value: string): string {
  // eslint-disable-next-line no-control-regex -- Remove non-printing input controls, preserving tabs/newlines and literal PDF punctuation.
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

/** Roll-paper layout: 58 mm media, 48 mm printable area, black text and measured height. */
function renderThermalDocument(
  doc: PDFKit.PDFDocument,
  source: z.output<typeof sourceSchema>,
  content: (layout: ThermalLayout) => void,
) {
  const lang = labels[source.locale];
  const mm = 72 / 25.4;
  const width = 58 * mm;
  const inset = 5 * mm;
  const printableWidth = width - inset * 2;
  const padding = 3 * mm;
  const footerHeight = 14;
  // Bound page length for mobile rasterizers; long sales continue on another 58 mm page.
  const maxBodyHeight = 280 * mm - padding * 2 - footerHeight;
  type Block = { text: string; size: number; bold: boolean; height: number };
  const pages: Block[][] = [[]];
  const heights = [0];
  const measure = (value: string, size: number, bold: boolean) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    return doc.heightOfString(value, { width: printableWidth, lineGap: 1 });
  };
  const add = (value: string, size = 9, bold = false) => {
    let remaining = literal(value);
    while (remaining.length) {
      let length = remaining.length;
      if (measure(remaining, size, bold) + 4 > maxBodyHeight) {
        let low = 1;
        let high = length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (measure(remaining.slice(0, middle), size, bold) + 4 <= maxBodyHeight) low = middle;
          else high = middle - 1;
        }
        length = low;
        const boundary = remaining.lastIndexOf(' ', length);
        if (boundary > 0) length = boundary + 1;
      }
      const value = remaining.slice(0, length);
      const height = measure(value, size, bold) + 4;
      let index = pages.length - 1;
      if (heights[index]! + height > maxBodyHeight) {
        pages.push([]);
        heights.push(0);
        index++;
      }
      pages[index]!.push({ text: value, size, bold, height });
      heights[index] = heights[index]! + height;
      remaining = remaining.slice(length);
    }
  };
  const field = (key: Label, value: string | null | undefined, bold = false) => {
    if (value !== undefined && value !== null) add(lang[key] + ': ' + value, bold ? 11 : 9, bold);
  };
  add(lang[source.documentType], 12, true);
  add('Warehouse Manager', 9);
  content({
    field,
    table(columns, rows) {
      if (!rows.length) add(lang.empty);
      for (const row of rows) {
        for (const column of columns)
          field(column.key, row[column.key], column.key === 'productName');
        add('------------------------', 8);
      }
    },
  });
  pages.forEach((blocks, index) => {
    const height = Math.max(50 * mm, heights[index]! + padding * 2 + footerHeight);
    doc.addPage({
      size: [width, height],
      margins: { top: padding, bottom: padding, left: inset, right: inset },
    });
    let y = padding;
    for (const block of blocks) {
      doc
        .font(block.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(block.size)
        .fillColor('#000000')
        .text(block.text, inset, y, { width: printableWidth, lineGap: 1 });
      y += block.height;
    }
    if (pages.length > 1) {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#000000')
        .text(
          lang.page + ' ' + (index + 1) + ' / ' + pages.length,
          inset,
          height - padding - footerHeight,
          { width: printableWidth, lineBreak: false, align: 'center' },
        );
    }
  });
}

/** Pure snapshot-to-bytes operation: no database, storage, clock-based IDs or source mutations. */
export async function renderDocumentPdf(input: unknown): Promise<RenderedDocumentPdf> {
  const source = parse(sourceSchema, input);
  if (sourcePairs[source.documentType] !== source.sourceType)
    throw new HttpProblem(422, 'INVALID_DOCUMENT_SOURCE', 'Invalid document/source pair');
  if (source.documentType === 'ROUTE_LOAD' && source.state !== 'CONFIRMED')
    throw new HttpProblem(409, 'ROUTE_LOAD_NOT_CONFIRMED', 'Route load must be confirmed');
  // Validate all fields before opening a PDF stream.
  const ticket = source.documentType === 'TICKET' ? parse(ticketSchema, source.snapshot) : null;
  const load = source.documentType === 'ROUTE_LOAD' ? parse(loadSchema, source.snapshot) : null;
  const returned =
    source.documentType === 'ROUTE_RETURN'
      ? parse(RouteReturnSnapshotSchema, source.snapshot)
      : null;
  const cash = source.documentType === 'CASH_CLOSE' ? parse(cashSchema, source.snapshot) : null;
  const report =
    source.documentType === 'REPORT'
      ? parse(reportSchema, source.snapshot.result ?? source.snapshot)
      : null;
  const lang = labels[source.locale];
  const createdAt = new Date(source.createdAt);
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    info: {
      Title: lang[source.documentType],
      Author: 'Warehouse Manager',
      Creator: 'Warehouse Manager',
      CreationDate: createdAt,
      ModDate: createdAt,
      Subject: `${source.sourceType}/${source.sourceId}`,
      Keywords: source.contentVersion,
    },
  });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  // Attach rejection observation before rendering, including synchronous writer failures.
  void output.catch(() => undefined);
  try {
    renderThermalDocument(doc, source, (layout) => {
      layout.field('createdAt', createdAt.toISOString());
      layout.field(
        'businessTimezone',
        source.businessTimezone ?? cash?.businessTimezone ?? report?.businessTimezone,
      );
      layout.field(
        'currencyCode',
        ticket?.currencyCode ??
          cash?.currencyCode ??
          report?.totals?.currencyCode ??
          source.currencyCode,
      );
      if (ticket) {
        layout.field('ticketNumber', ticket.ticketNumber);
        layout.field('saleNumber', ticket.saleNumber);
        layout.field('paymentMethod', ticket.paymentMethod);
        layout.table(
          [
            { key: 'productName', width: 1 },
            { key: 'quantity', width: 1 },
            { key: 'unitCode', width: 1 },
            { key: 'unitPrice', width: 1 },
            { key: 'lineAmount', width: 1 },
          ],
          ticket.lines,
        );
        layout.field('total', ticket.total, true);
      }
      if (load) {
        layout.field('loadNumber', load.loadNumber);
        layout.field('routeNumber', load.routeNumber);
        layout.table(
          [
            { key: 'productName', width: 337.28 },
            { key: 'quantity', width: 100, numeric: true },
            { key: 'unitCode', width: 70 },
          ],
          load.lines,
        );
      }
      if (returned) {
        layout.field('routeNumber', returned.routeNumber);
        layout.field(
          'returnKind',
          returned.kind === 'APPROVED'
            ? source.locale === 'es'
              ? 'Aprobada'
              : 'Approved'
            : source.locale === 'es'
              ? 'Declarada por el vendedor; pendiente de conciliación'
              : 'Declared by seller; pending reconciliation',
        );
        for (const item of returned.lines) {
          layout.field('productName', item.productName);
          layout.field('quantity', item.quantity);
          layout.field('unitCode', item.unitCode);
          layout.field('expectedQuantity', item.expectedQuantity);
          layout.field('differenceQuantity', item.differenceQuantity);
          if (item.differenceReason) layout.field('differenceReason', item.differenceReason);
        }
      }
      if (cash) {
        layout.field('closeNumber', cash.closeNumber);
        for (const key of [
          'periodKind',
          'anchorDate',
          'periodStart',
          'periodEnd',
          'supersedesCashCloseId',
          'correctionReason',
        ] as const)
          layout.field(key, cash[key]);
        if (cash.lines)
          layout.table(
            [
              { key: 'reportingGroup', width: 337.28 },
              { key: 'total', width: 170, numeric: true },
            ],
            cash.lines,
          );
        for (const key of [
          'grossTotal',
          'expensesTotal',
          'netTotal',
          'partnerRate',
          'partnerShare',
          'ownerShare',
        ] as const)
          layout.field(key, cash[key], key === 'grossTotal');
      }
      if (report) {
        layout.field('reportType', report.reportType);
        for (const key of ['periodKind', 'anchorDate', 'periodStart', 'periodEnd'] as const)
          layout.field(key, report.filters?.[key]);
        const keys = [
          'branchName',
          'branchCode',
          'driverName',
          'productName',
          'reportingGroup',
          'saleCount',
          'quantity',
          'unitCode',
          'unitPrice',
          'lineAmount',
          'total',
        ] as const;
        const present = keys.filter((key) => report.rows.some((row) => row[key] !== undefined));
        // Wide or heterogeneous snapshots remain readable as flowing records instead of shrinking text.
        if (present.length > 5) {
          for (const row of report.rows) {
            for (const key of present) layout.field(key, row[key]);
          }
        } else {
          const weights = present.map((key) =>
            ['productName', 'branchName', 'driverName', 'reportingGroup'].includes(key) ? 2.5 : 1,
          );
          const weight = weights.reduce((sum, value) => sum + value, 0);
          layout.table(
            present.map((key, index) => ({
              key,
              width: (contentWidth * weights[index]!) / weight,
              numeric: ['saleCount', 'quantity', 'unitPrice', 'lineAmount', 'total'].includes(key),
            })),
            report.rows,
          );
        }
        layout.field('grossTotal', report.grossTotal, true);
        if (report.totals)
          for (const key of [
            'grossTotal',
            'partnerRate',
            'partnerShare',
            'partnerAmount',
            'ownerShare',
            'remainingAmount',
          ] as const)
            layout.field(key, report.totals[key], key === 'grossTotal');
      }
    });
    doc.end();
    const bytes = await output;
    return {
      bytes,
      filename: documentPdfFilename(source),
      contentType: 'application/pdf',
      contentHash: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

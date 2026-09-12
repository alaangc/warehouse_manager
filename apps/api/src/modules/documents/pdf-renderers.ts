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
  documentType: z.enum(['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT']),
  sourceType: z.enum(['SALE', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT_SNAPSHOT']),
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

const labels = {
  es: {
    TICKET: 'Ticket de venta',
    ROUTE_LOAD: 'Carga de ruta',
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
type Column = { key: Label; width: number; numeric?: boolean };
const margin = 44;
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

class Layout {
  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly lang: typeof labels.es | typeof labels.en,
  ) {}
  private room(height: number) {
    if (this.doc.y + height > this.doc.page.height - 60) this.doc.addPage();
  }
  field(key: Label, value: string | null | undefined, emphasized = false) {
    if (value === undefined || value === null) return;
    this.room(30);
    this.doc
      .font(emphasized ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(emphasized ? 13 : 10)
      .fillColor('#172B3A')
      .text(`${this.lang[key]}: ${literal(value)}`, margin, this.doc.y, { width: contentWidth });
    this.doc.moveDown(0.45);
  }
  table(columns: Column[], rows: Array<Partial<Record<Label, string | undefined>>>) {
    if (!rows.length) {
      this.doc
        .font('Helvetica')
        .fontSize(10)
        .text(this.lang.empty, margin, this.doc.y, { width: contentWidth });
      this.doc.moveDown();
      return;
    }
    const header = () => {
      this.room(48);
      const y = this.doc.y;
      this.doc.rect(margin, y, contentWidth, 28).fill('#EAF0F4');
      let x = margin;
      for (const column of columns) {
        this.doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#172B3A')
          .text(this.lang[column.key], x + 6, y + 8, {
            width: column.width - 12,
            lineBreak: false,
            align: column.numeric ? 'right' : 'left',
          });
        x += column.width;
      }
      this.doc.y = y + 34;
    };
    header();
    for (const row of rows) {
      this.doc.font('Helvetica').fontSize(9);
      const height =
        Math.max(
          ...columns.map((column) =>
            this.doc.heightOfString(literal(row[column.key] ?? ''), { width: column.width - 12 }),
          ),
          12,
        ) + 14;
      // Oversized records use normal flowing text so no field is clipped or discarded.
      if (height > this.doc.page.height - 180) {
        for (const column of columns) this.field(column.key, row[column.key]);
        header();
        continue;
      }
      if (this.doc.y + height > this.doc.page.height - 60) {
        this.doc.addPage();
        header();
      }
      const y = this.doc.y;
      let x = margin;
      for (const column of columns) {
        this.doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#172B3A')
          .text(literal(row[column.key] ?? ''), x + 6, y + 4, {
            width: column.width - 12,
            align: column.numeric ? 'right' : 'left',
          });
        x += column.width;
      }
      this.doc
        .moveTo(margin, y + height - 3)
        .lineTo(margin + contentWidth, y + height - 3)
        .strokeColor('#DFE5EA')
        .lineWidth(0.5)
        .stroke();
      this.doc.y = y + height;
    }
    this.doc.x = margin;
    this.doc.moveDown();
  }
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
  const cash = source.documentType === 'CASH_CLOSE' ? parse(cashSchema, source.snapshot) : null;
  const report =
    source.documentType === 'REPORT'
      ? parse(reportSchema, source.snapshot.result ?? source.snapshot)
      : null;
  const lang = labels[source.locale];
  const createdAt = new Date(source.createdAt);
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 100, bottom: 60, left: margin, right: margin },
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
    doc.on('pageAdded', () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#172B3A')
        .text(lang[source.documentType], margin, 35, { width: contentWidth });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#546575')
        .text(`Warehouse Manager  |  ${source.sourceId}`, margin, 61, { width: contentWidth });
      doc
        .moveTo(margin, 80)
        .lineTo(margin + contentWidth, 80)
        .strokeColor('#DFE5EA')
        .stroke();
      doc.x = margin;
      doc.y = 100;
    });
    doc.addPage();
    const layout = new Layout(doc, lang);
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
          { key: 'productName', width: 207.28 },
          { key: 'quantity', width: 70, numeric: true },
          { key: 'unitCode', width: 50 },
          { key: 'unitPrice', width: 90, numeric: true },
          { key: 'lineAmount', width: 90, numeric: true },
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
          doc.moveDown();
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
    const pages = doc.bufferedPageRange();
    for (let index = pages.start; index < pages.start + pages.count; index++) {
      doc.switchToPage(index);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#546575')
        .text(`${lang.page} ${index + 1} / ${pages.count}`, margin, doc.page.height - 38, {
          width: contentWidth,
          align: 'right',
          lineBreak: false,
        });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
    const bytes = await output;
    const version = createHash('sha256').update(source.contentVersion).digest('hex').slice(0, 12);
    return {
      bytes,
      filename: `${source.documentType.toLowerCase()}-${source.sourceId.toLowerCase()}-v${version}.pdf`,
      contentType: 'application/pdf',
      contentHash: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    doc.destroy();
    throw error;
  }
}

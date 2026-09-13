import CodepageEncoder from '@point-of-sale/codepage-encoder';
import { PrinterProfileResourceSchema, ThermalDocumentSchema } from '@warehouse/contracts';
import { parsePrintableDocument, PrinterError, type PrinterProfile } from './printer-adapter.js';

type FormatOptions = { profile: PrinterProfile; mode: 'PRINT' | 'REPRINT'; confirmed?: boolean };

function safeText(value: string): string {
  // Receipt data cannot inject control commands, extra lines or bidi overrides.
  return value
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
function wrap(value: string, columns: number): string[] {
  const result: string[] = [];
  let current = '';
  for (const word of value.split(' ')) {
    if (!word) continue;
    const points = Array.from(word);
    if (current && Array.from(current).length + 1 + points.length <= columns) {
      current += ` ${word}`;
      continue;
    }
    if (current) result.push(current);
    while (points.length > columns) result.push(points.splice(0, columns).join(''));
    current = points.join('');
  }
  if (current) result.push(current);
  return result.length ? result : [''];
}

export function formatEscPos(raw: unknown, options: FormatOptions): Uint8Array<ArrayBuffer> {
  parsePrintableDocument(raw);
  const parsed = ThermalDocumentSchema.safeParse(raw);
  if (!parsed.success) throw new PrinterError('DOCUMENT_SNAPSHOT_INVALID', 422);
  const profileResult = PrinterProfileResourceSchema.safeParse(options?.profile);
  if (!profileResult.success || !profileResult.data.active)
    throw new PrinterError('PROFILE_INVALID', 422);
  const profile = profileResult.data;
  if (!['PRINT', 'REPRINT'].includes(options.mode))
    throw new PrinterError('PRINT_REQUEST_INVALID', 422);
  if (options.mode === 'REPRINT' && options.confirmed !== true)
    throw new PrinterError('REPRINT_CONFIRMATION_REQUIRED', 409);
  const columns = profile.paperWidthMm === 58 ? 32 : 48;
  const lines: string[] = [];
  const add = (value: string) => lines.push(...wrap(safeText(value), columns));
  const separator = () => lines.push('-'.repeat(columns));
  const doc = parsed.data;
  if (options.mode === 'REPRINT') {
    add('*** REIMPRESION ***');
    separator();
  }
  if (doc.documentType === 'TICKET') {
    const s = doc.snapshot;
    add('TICKET DE VENTA');
    add(`Ticket: ${s.ticketNumber}`);
    add(`Venta: ${s.saleNumber}`);
    separator();
    for (const item of s.lines) {
      add(item.productName);
      add(`${item.quantity} ${item.unitCode} x ${item.unitPrice}`);
      add(`Importe: ${item.lineAmount} ${s.currencyCode}`);
    }
    separator();
    add(`TOTAL: ${s.total} ${s.currencyCode}`);
    if (s.paymentMethod) add(`Pago: ${s.paymentMethod}`);
  } else if (doc.documentType === 'ROUTE_LOAD') {
    const s = doc.snapshot;
    add('CARGA DE RUTA');
    add(`Carga: ${s.loadNumber}`);
    add(`Ruta: ${s.routeNumber}`);
    separator();
    for (const item of s.lines) {
      add(item.productName);
      add(`${item.quantity} ${item.unitCode}`);
    }
  } else {
    const s = doc.snapshot;
    add('CORTE DE CAJA');
    add(`Corte: ${s.closeNumber}`);
    if (s.periodKind) add(`Periodo: ${s.periodKind}`);
    if (s.periodStart) add(`Desde: ${s.periodStart}`);
    if (s.periodEnd) add(`Hasta (exclusivo): ${s.periodEnd}`);
    if (s.businessTimezone) add(`Zona: ${s.businessTimezone}`);
    separator();
    for (const group of s.lines ?? [])
      add(`${group.reportingGroup}: ${group.total} ${s.currencyCode}`);
    add(`Ventas: ${s.grossTotal} ${s.currencyCode}`);
    if (s.expensesTotal !== undefined) add(`Gastos: ${s.expensesTotal} ${s.currencyCode}`);
    if (s.netTotal !== undefined) add(`Neto: ${s.netTotal} ${s.currencyCode}`);
    if (s.partnerRate !== undefined) add(`Tasa socio: ${s.partnerRate}`);
    add(`Socio: ${s.partnerShare} ${s.currencyCode}`);
    add(`Propietario: ${s.ownerShare} ${s.currencyCode}`);
    if (s.supersedesCashCloseId) add(`Sustituye: ${s.supersedesCashCloseId}`);
    if (s.correctionReason) add(`Motivo: ${s.correctionReason}`);
  }
  const content: number[] = [];
  for (const line of [...lines, '', '']) {
    if (profile.encoding === 'UTF-8') {
      content.push(...new TextEncoder().encode(line));
    } else {
      for (const character of line) {
        const encoded = CodepageEncoder.encode(
          character,
          profile.encoding === 'CP850' ? 'cp850' : 'cp437',
        );
        const byte = encoded[0]!;
        // Some OEM glyphs occupy printer control positions. Never emit those
        // positions from data, even when the codepage maps a visible symbol there.
        content.push(encoded.length === 1 && byte >= 32 && byte !== 127 ? byte : 63);
      }
    }
    content.push(10);
  }
  // ESC @ resets formatting; Epson ESC t selects CP437/CP850. Approved UTF-8
  // profiles require FS ( C function 48 support. Feed for tear-off, without a cutter.
  const encoding =
    profile.encoding === 'UTF-8'
      ? [28, 40, 67, 2, 0, 48, 2]
      : [27, 116, profile.encoding === 'CP850' ? 2 : 0];
  const bytes = new Uint8Array(2 + encoding.length + content.length);
  bytes.set([27, 64]);
  bytes.set(encoding, 2);
  bytes.set(content, 2 + encoding.length);
  return bytes;
}

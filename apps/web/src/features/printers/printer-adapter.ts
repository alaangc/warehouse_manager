import {
  DocumentPrintMetadataSchema,
  type PrinterProfileResourceSchema,
} from '@warehouse/contracts';

export type PrinterProfile = ReturnType<typeof PrinterProfileResourceSchema.parse>;
export type TestResult = { state: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; errorCode?: string };
export type PrintRequest = {
  mode: 'PRINT' | 'REPRINT';
  confirmed?: boolean;
  bytes: Uint8Array;
};
export type PrinterCapability = 'AVAILABLE' | 'UNSUPPORTED' | 'INSECURE' | 'POLICY_DENIED';
export type PrinterConnection = {
  state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'TESTING' | 'PRINTING';
  deviceLabel?: string;
};
export class PrinterError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
  }
}

export function parsePrintableDocument(raw: unknown) {
  const parsed = DocumentPrintMetadataSchema.safeParse(raw);
  if (!parsed.success) throw new PrinterError('DOCUMENT_INVALID', 422);
  const doc = parsed.data;
  if (doc.documentType === 'REPORT') throw new PrinterError('DOCUMENT_NOT_PRINTABLE', 422);
  const pairs = { TICKET: 'SALE', ROUTE_LOAD: 'ROUTE_LOAD', CASH_CLOSE: 'CASH_CLOSE' };
  if (pairs[doc.documentType] !== doc.sourceType) throw new PrinterError('DOCUMENT_INVALID', 422);
  if (doc.documentType === 'ROUTE_LOAD' && doc.sourceState !== 'CONFIRMED')
    throw new PrinterError('ROUTE_LOAD_NOT_CONFIRMED', 409);
  if (
    doc.state !== 'READY' ||
    (doc.documentType === 'TICKET' && doc.sourceState !== 'COMPLETED') ||
    (doc.documentType === 'CASH_CLOSE' && doc.sourceState !== 'CLOSED')
  )
    throw new PrinterError('DOCUMENT_NOT_READY', 409);
  return doc;
}
/** Device handles are deliberately absent from the public API and server payloads. */
export interface PrinterAdapter {
  capability(): PrinterCapability;
  getSnapshot: () => PrinterConnection;
  subscribe: (listener: () => void) => () => void;
  connect(profile: PrinterProfile): Promise<void>;
  test(): Promise<TestResult>;
  print(document: unknown, request: PrintRequest): Promise<TestResult>;
  disconnect(): void;
}

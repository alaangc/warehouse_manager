import type { PrinterProfileResourceSchema } from '@warehouse/contracts';

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

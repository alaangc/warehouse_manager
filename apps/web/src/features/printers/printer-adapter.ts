import type { PrinterProfileResourceSchema } from '@warehouse/contracts';

export type PrinterProfile = ReturnType<typeof PrinterProfileResourceSchema.parse>;
export type TestResult = { state: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; errorCode?: string };
export type PrinterCapability = 'AVAILABLE' | 'UNSUPPORTED' | 'INSECURE' | 'POLICY_DENIED';
export type PrinterConnection = {
  state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'TESTING';
  deviceLabel?: string;
};
export class PrinterError extends Error {
  constructor(public readonly code: string) {
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
  disconnect(): void;
}

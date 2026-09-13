import { PrinterProfileResourceSchema, DocumentPrintMetadataSchema } from '@warehouse/contracts';
import {
  PrinterError,
  type PrinterAdapter,
  type PrinterCapability,
  type PrinterConnection,
  type PrinterProfile,
  type TestResult,
  type PrintRequest,
} from './printer-adapter.js';

type Characteristic = {
  writeValueWithResponse?: (data: Uint8Array<ArrayBuffer>) => Promise<void>;
  writeValueWithoutResponse?: (data: Uint8Array<ArrayBuffer>) => Promise<void>;
};
type Gatt = {
  connected: boolean;
  connect(): Promise<{
    getPrimaryService(
      uuid: string | number,
    ): Promise<{ getCharacteristic(uuid: string | number): Promise<Characteristic> }>;
  }>;
  disconnect(): void;
};
type Device = {
  name?: string;
  gatt?: Gatt;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};
type Bluetooth = {
  requestDevice(options: { filters: Array<{ services: Array<string | number> }> }): Promise<Device>;
};
function bluetooth() {
  return (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
}
function uuid(value: string): string | number {
  if (/^(?:0x)?[a-f\d]{4}(?:[a-f\d]{4})?$/i.test(value))
    return parseInt(value.replace(/^0x/i, ''), 16);
  if (/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value))
    return value.toLowerCase();
  throw new PrinterError('PROFILE_INVALID');
}
export class WebBluetoothPrinterAdapter implements PrinterAdapter {
  private snapshot: PrinterConnection = { state: 'DISCONNECTED' };
  private listeners = new Set<() => void>();
  private device: Device | undefined;
  private characteristic: Characteristic | undefined;
  private profile: PrinterProfile | undefined;
  private generation = 0;
  private testing = false;
  private uncertainDocuments = new Set<string>();
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: PrinterConnection['state']) {
    this.snapshot = {
      state,
      ...(this.device?.name ? { deviceLabel: this.device.name.slice(0, 120) } : {}),
    };
    this.listeners.forEach((listener) => listener());
  }
  capability(): PrinterCapability {
    if (!bluetooth()) return 'UNSUPPORTED';
    if (!globalThis.isSecureContext) return 'INSECURE';
    const policy = document as Document & {
      permissionsPolicy?: { allowsFeature(name: string): boolean };
      featurePolicy?: { allowsFeature(name: string): boolean };
    };
    if ((policy.permissionsPolicy ?? policy.featurePolicy)?.allowsFeature('bluetooth') === false)
      return 'POLICY_DENIED';
    return 'AVAILABLE';
  }
  private onDisconnect = () => {
    this.disconnect();
  };
  disconnect() {
    this.generation++;
    const device = this.device;
    this.device = undefined;
    this.characteristic = undefined;
    this.profile = undefined;
    device?.removeEventListener('gattserverdisconnected', this.onDisconnect);
    device?.gatt?.disconnect();
    this.publish('DISCONNECTED');
  }
  async connect(raw: PrinterProfile) {
    if (this.testing || this.snapshot.state === 'CONNECTING') throw new PrinterError('BUSY');
    const capability = this.capability();
    if (capability !== 'AVAILABLE') throw new PrinterError(capability);
    if (navigator.userActivation?.isActive === false) throw new PrinterError('GESTURE_REQUIRED');
    const parsed = PrinterProfileResourceSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.active) throw new PrinterError('PROFILE_INVALID');
    const profile = parsed.data;
    const serviceUuid = uuid(profile.serviceUuid),
      characteristicUuid = uuid(profile.writeCharacteristicUuid);
    this.disconnect();
    const generation = this.generation;
    this.publish('CONNECTING');
    try {
      // No await before requestDevice: preserve the click's transient user activation.
      const device = await bluetooth()!.requestDevice({ filters: [{ services: [serviceUuid] }] });
      if (generation !== this.generation) {
        device.gatt?.disconnect();
        throw new PrinterError('CANCELLED');
      }
      this.device = device;
      if (!device.gatt) throw new PrinterError('CONNECTION_FAILED');
      device.addEventListener('gattserverdisconnected', this.onDisconnect);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(serviceUuid);
      const characteristic = await service.getCharacteristic(characteristicUuid);
      if (generation !== this.generation || !device.gatt.connected) {
        device.gatt.disconnect();
        throw new PrinterError('CANCELLED');
      }
      const write =
        profile.writeMode === 'WITH_RESPONSE'
          ? characteristic.writeValueWithResponse
          : characteristic.writeValueWithoutResponse;
      if (!write) throw new PrinterError('PROFILE_INVALID');
      this.profile = profile;
      this.characteristic = characteristic;
      this.publish('CONNECTED');
    } catch (error) {
      if (generation === this.generation) this.disconnect();
      if (error instanceof PrinterError) throw error;
      const name = error instanceof Error || error instanceof DOMException ? error.name : '';
      throw new PrinterError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'PERMISSION_DENIED'
          : name === 'NotFoundError'
            ? 'CANCELLED'
            : 'CONNECTION_FAILED',
      );
    }
  }
  async test(): Promise<TestResult> {
    const bytes = new Uint8Array([
      27,
      64,
      ...new TextEncoder().encode('PRUEBA / TEST\nWarehouse Manager\n0123456789\n\n\n'),
    ]);
    return this.send(bytes, 'TESTING');
  }
  async print(raw: unknown, request: PrintRequest): Promise<TestResult> {
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
    if (!request || !['PRINT', 'REPRINT'].includes(request.mode))
      throw new PrinterError('PRINT_REQUEST_INVALID', 422);
    const identity = `${doc.id.toLowerCase()}:${doc.contentVersion}`;
    if (
      (request.mode === 'REPRINT' && request.confirmed !== true) ||
      (this.uncertainDocuments.has(identity) &&
        (request.mode !== 'REPRINT' || request.confirmed !== true))
    )
      throw new PrinterError('REPRINT_CONFIRMATION_REQUIRED', 409);
    if (
      !ArrayBuffer.isView(request.bytes) ||
      Object.prototype.toString.call(request.bytes) !== '[object Uint8Array]' ||
      request.bytes.byteLength === 0
    )
      throw new PrinterError('PRINT_BYTES_REQUIRED', 422);
    // Freeze the payload before any asynchronous device work. Formatting and API
    // acceptance belong to the caller; this transport never changes business data.
    const result = await this.send(new Uint8Array(request.bytes), 'PRINTING');
    if (result.state === 'UNKNOWN') this.uncertainDocuments.add(identity);
    else if (result.state === 'SUCCEEDED') this.uncertainDocuments.delete(identity);
    return result;
  }
  private async send(
    bytes: Uint8Array<ArrayBuffer>,
    state: 'TESTING' | 'PRINTING',
  ): Promise<TestResult> {
    if (this.testing) return { state: 'FAILED', errorCode: 'BUSY' };
    const capability = this.capability();
    if (capability !== 'AVAILABLE') return { state: 'FAILED', errorCode: capability };
    const profile = this.profile,
      characteristic = this.characteristic,
      device = this.device;
    if (!profile || !characteristic || !device?.gatt?.connected)
      return { state: 'FAILED', errorCode: 'NOT_CONNECTED' };
    const generation = this.generation;
    let attempted = false;
    this.testing = true;
    this.publish(state);
    try {
      for (let offset = 0; offset < bytes.length; offset += profile.maxChunkBytes) {
        if (generation !== this.generation || !device.gatt.connected)
          throw new PrinterError('DISCONNECTED');
        attempted = true;
        const chunk = bytes.slice(offset, offset + profile.maxChunkBytes);
        if (profile.writeMode === 'WITH_RESPONSE')
          await characteristic.writeValueWithResponse!(chunk);
        else await characteristic.writeValueWithoutResponse!(chunk);
        if (generation !== this.generation || !device.gatt.connected)
          throw new PrinterError('DISCONNECTED');
        if (profile.interChunkDelayMs && offset + profile.maxChunkBytes < bytes.length)
          await new Promise((resolve) => setTimeout(resolve, profile.interChunkDelayMs));
      }
      return { state: 'SUCCEEDED' };
    } catch {
      this.disconnect();
      return {
        state: attempted ? 'UNKNOWN' : 'FAILED',
        errorCode: attempted ? 'WRITE_UNCERTAIN' : 'NOT_CONNECTED',
      };
    } finally {
      this.testing = false;
      if (generation === this.generation) this.publish('CONNECTED');
    }
  }
}

import { PrinterProfileResourceSchema } from '@warehouse/contracts';
import {
  PrinterError,
  type PrinterAdapter,
  type PrinterCapability,
  type PrinterConnection,
  type PrinterProfile,
  type TestResult,
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
    if (this.testing) return { state: 'FAILED', errorCode: 'BUSY' };
    const profile = this.profile,
      characteristic = this.characteristic,
      device = this.device;
    if (!profile || !characteristic || !device?.gatt?.connected)
      return { state: 'FAILED', errorCode: 'NOT_CONNECTED' };
    const generation = this.generation;
    // ASCII-only setup test is safe across all approved encodings. Business templates belong to T129.
    const bytes = new Uint8Array([
      27,
      64,
      ...new TextEncoder().encode('PRUEBA / TEST\nWarehouse Manager\n0123456789\n\n\n'),
    ]);
    let attempted = false;
    this.testing = true;
    this.publish('TESTING');
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

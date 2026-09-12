import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebBluetoothPrinterAdapter } from '../../src/features/printers/web-bluetooth-adapter.js';

export const profile = {
  id: '00000000-0000-4000-8000-000000000040',
  name: 'Approved printer',
  model: 'BLE',
  serviceUuid: 'ffe0',
  writeCharacteristicUuid: 'ffe1',
  writeMode: 'WITH_RESPONSE' as const,
  commandDialect: 'ESC_POS' as const,
  paperWidthMm: 58 as const,
  encoding: 'CP850' as const,
  maxChunkBytes: 8,
  interChunkDelayMs: 0,
  active: true,
  version: 1,
  transport: 'WEB_BLUETOOTH_BLE' as const,
};
function setup() {
  const events = new EventTarget();
  const write = vi.fn().mockResolvedValue(undefined);
  const characteristic = { writeValueWithResponse: write, writeValueWithoutResponse: write };
  const getCharacteristic = vi.fn().mockResolvedValue(characteristic);
  const getPrimaryService = vi.fn().mockResolvedValue({ getCharacteristic });
  const gatt = {
    connected: true,
    connect: vi.fn().mockResolvedValue({ getPrimaryService }),
    disconnect: vi.fn(),
  };
  const device = {
    name: 'Printer',
    gatt,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  const requestDevice = vi.fn().mockResolvedValue(device);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { bluetooth: { requestDevice }, userActivation: { isActive: true } });
  return {
    adapter: new WebBluetoothPrinterAdapter(),
    requestDevice,
    gatt,
    events,
    write,
    getPrimaryService,
    getCharacteristic,
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('T117 Bluetooth boundary', () => {
  it('rejects a blocking permissions policy before device access', async () => {
    const s = setup();
    vi.stubGlobal('document', { permissionsPolicy: { allowsFeature: () => false } });
    expect(s.adapter.capability()).toBe('POLICY_DENIED');
    await expect(s.adapter.connect(profile)).rejects.toMatchObject({ code: 'POLICY_DENIED' });
    expect(s.requestDevice).not.toHaveBeenCalled();
  });
  it('uses the configured no-response mode and prevents overlapping tests', async () => {
    const s = setup();
    await s.adapter.connect({ ...profile, writeMode: 'WITHOUT_RESPONSE' });
    let finish!: () => void;
    s.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const first = s.adapter.test();
    expect(await s.adapter.test()).toEqual({ state: 'FAILED', errorCode: 'BUSY' });
    finish();
    expect(await first).toEqual({ state: 'SUCCEEDED' });
  });
  it('stops after a disconnect during a chunk, including an ambiguous final write', async () => {
    const s = setup();
    await s.adapter.connect({ ...profile, maxChunkBytes: 1024 });
    s.write.mockImplementationOnce(async () => {
      s.gatt.connected = false;
      s.events.dispatchEvent(new Event('gattserverdisconnected'));
    });
    expect(await s.adapter.test()).toMatchObject({ state: 'UNKNOWN' });
    expect(s.write).toHaveBeenCalledTimes(1);
    expect(s.adapter.getSnapshot().state).toBe('DISCONNECTED');
  });
  it('rejects invalid transport UUIDs before opening the device chooser', async () => {
    const s = setup();
    await expect(s.adapter.connect({ ...profile, serviceUuid: 'invalid' })).rejects.toMatchObject({
      code: 'PROFILE_INVALID',
    });
    expect(s.requestDevice).not.toHaveBeenCalled();
  });
  it('uses approved UUID filters and writes the test in ordered chunks', async () => {
    const s = setup();
    const connecting = s.adapter.connect(profile);
    expect(s.requestDevice).toHaveBeenCalledWith({ filters: [{ services: [0xffe0] }] });
    await connecting;
    expect(s.getPrimaryService).toHaveBeenCalledWith(0xffe0);
    expect(s.getCharacteristic).toHaveBeenCalledWith(0xffe1);
    expect(await s.adapter.test()).toEqual({ state: 'SUCCEEDED' });
    const bytes = s.write.mock.calls.flatMap(([chunk]) => Array.from(chunk as Uint8Array));
    expect(new TextDecoder().decode(new Uint8Array(bytes))).toContain('PRUEBA / TEST');
    expect(s.write.mock.calls.every(([chunk]) => chunk.length <= 8)).toBe(true);
    s.adapter.disconnect();
    expect(s.gatt.disconnect).toHaveBeenCalled();
    expect(s.adapter.getSnapshot().state).toBe('DISCONNECTED');
  });
  it.each(['insecure', 'unsupported', 'gesture', 'inactive'])(
    'rejects %s before device access',
    async (kind) => {
      const s = setup();
      if (kind === 'insecure') vi.stubGlobal('isSecureContext', false);
      if (kind === 'unsupported') vi.stubGlobal('navigator', {});
      if (kind === 'gesture')
        vi.stubGlobal('navigator', {
          bluetooth: { requestDevice: s.requestDevice },
          userActivation: { isActive: false },
        });
      await expect(
        s.adapter.connect({ ...profile, active: kind !== 'inactive' }),
      ).rejects.toThrow();
      expect(s.requestDevice).not.toHaveBeenCalled();
    },
  );
  it('reports permission denial and never writes', async () => {
    const s = setup();
    s.requestDevice.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await expect(s.adapter.connect(profile)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(s.write).not.toHaveBeenCalled();
  });
  it('reports UNKNOWN after a rejected write and never automatically retries', async () => {
    const s = setup();
    await s.adapter.connect(profile);
    s.write.mockRejectedValue(new DOMException('Disconnected', 'NetworkError'));
    expect(await s.adapter.test()).toMatchObject({ state: 'UNKNOWN' });
    expect(s.write).toHaveBeenCalledTimes(1);
  });
  it('reports FAILED without a connection and handles remote disconnect', async () => {
    const s = setup();
    expect(await s.adapter.test()).toMatchObject({ state: 'FAILED' });
    await s.adapter.connect(profile);
    s.gatt.connected = false;
    s.events.dispatchEvent(new Event('gattserverdisconnected'));
    expect(s.adapter.getSnapshot().state).toBe('DISCONNECTED');
    expect(await s.adapter.test()).toMatchObject({ state: 'FAILED' });
    expect(s.write).not.toHaveBeenCalled();
  });
  it('cancels pending connection on disposal without leaving a device connected', async () => {
    const s = setup();
    let resolve!: (value: unknown) => void;
    s.requestDevice.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = s.adapter.connect(profile);
    s.adapter.disconnect();
    resolve({ gatt: s.gatt });
    await expect(pending).rejects.toThrow();
    expect(s.gatt.disconnect).toHaveBeenCalled();
    expect(s.adapter.getSnapshot().state).toBe('DISCONNECTED');
  });
});

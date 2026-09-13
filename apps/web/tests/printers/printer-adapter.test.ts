import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebBluetoothPrinterAdapter } from '../../src/features/printers/web-bluetooth-adapter.js';

// Formatter acceptance stays independent from the transport's prepared-byte input.
const formatterPath = '../../src/features/printers/escpos-formatter.js';
const profile = {
  id: '00000000-0000-4000-8000-000000000118',
  name: 'Approved BLE',
  model: 'Test',
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
function document(documentType = 'TICKET') {
  return {
    id: '00000000-0000-4000-8000-000000000119',
    documentType,
    sourceType: documentType === 'TICKET' ? 'SALE' : documentType,
    sourceId: '00000000-0000-4000-8000-000000000120',
    state: 'READY',
    sourceState:
      documentType === 'ROUTE_LOAD'
        ? 'CONFIRMED'
        : documentType === 'CASH_CLOSE'
          ? 'CLOSED'
          : 'COMPLETED',
    contentVersion: '1',
    snapshot: {
      ticketNumber: 'T-118',
      saleNumber: 'S-118',
      loadNumber: 'L-118',
      routeNumber: 'R-118',
      closeNumber: 'C-118',
      currencyCode: 'MXN',
      lines: [
        {
          productName: 'Piñata café',
          unitCode: 'PZA',
          quantity: '2.000',
          unitPrice: '10.0050',
          lineAmount: '20.01',
        },
      ],
      total: '20.01',
      grossTotal: '20.01',
      expensesTotal: '0.00',
      netTotal: '20.01',
      partnerShare: '10.01',
      ownerShare: '10.00',
    },
  };
}
async function format(doc = document(), options = {}) {
  const { formatEscPos } = await import(formatterPath);
  return formatEscPos(doc, { profile, mode: 'PRINT', ...options }) as Uint8Array;
}
const transportBytes = new TextEncoder().encode('COMMITTED DOCUMENT\n0123456789\n\n');
function transport(options = {}) {
  const events = new EventTarget();
  const write = vi.fn().mockResolvedValue(undefined);
  const gatt = {
    connected: true,
    disconnect: vi.fn(),
    connect: vi.fn(async () => ({
      getPrimaryService: async () => ({
        getCharacteristic: async () => ({
          writeValueWithResponse: write,
          writeValueWithoutResponse: write,
        }),
      }),
    })),
  };
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    userActivation: { isActive: true },
    bluetooth: {
      requestDevice: vi.fn(async () => ({
        gatt,
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
      })),
    },
  });
  const adapter = new WebBluetoothPrinterAdapter();
  // Deliberately assert the future public API at runtime, not a fake implementation.
  const print = (doc = document(), request = {}) => {
    expect(adapter).toHaveProperty('print', expect.any(Function));
    return Reflect.get(adapter, 'print').call(adapter, doc, {
      mode: 'PRINT',
      bytes: transportBytes,
      ...request,
    }) as Promise<{ state: string }>;
  };
  return {
    adapter,
    write,
    gatt,
    events,
    print,
    connect: () => adapter.connect({ ...profile, ...options }),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('T118 ESC/POS templates (T129 red phase)', () => {
  it.each(['CP437', 'CP850', 'UTF-8'])(
    'honors the approved %s Spanish encoding',
    async (encoding) => {
      const bytes = await format(document(), { profile: { ...profile, encoding } });
      const raw = String.fromCharCode(...bytes);
      const expected =
        encoding === 'UTF-8'
          ? String.fromCharCode(...new TextEncoder().encode('Piñata café'))
          : 'Pi\xa4ata caf\x82';
      expect(raw).toContain(expected);
    },
  );
  it.each(['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE'])(
    '%s includes its own historical template',
    async (type) => {
      const bytes = await format(document(type));
      const text = String.fromCharCode(...bytes);
      const required = {
        TICKET: ['T-118', 'S-118', '20.01'],
        ROUTE_LOAD: ['L-118', 'R-118', '2.000'],
        CASH_CLOSE: ['C-118', '20.01', '0.00', '10.01', '10.00'],
      }[type]!;
      for (const value of required) expect(text).toContain(value);
      expect(Array.from(bytes.slice(0, 2))).toEqual([27, 64]);
    },
  );
  it('encodes Spanish ñ and é as CP850 bytes, not UTF-8', async () => {
    const bytes = await format();
    expect(Array.from(bytes)).toEqual(expect.arrayContaining([0xa4, 0x82]));
    expect(Array.from(bytes)).not.toContain(0xc3);
  });
  it.each([
    [58, 32],
    [80, 48],
  ])('wraps %s mm paper at %s columns without losing words', async (width, columns) => {
    const doc = document();
    doc.snapshot.lines[0]!.productName = 'PRODUCTO '.repeat(16).trim();
    const bytes = await format(doc, { profile: { ...profile, paperWidthMm: width } });
    // Remove ESC/POS initialization, code page selection and cut commands only.
    // eslint-disable-next-line no-control-regex -- ESC/POS deliberately contains control bytes.
    const text = String.fromCharCode(...bytes).replace(/\x1b@|\x1bt[\s\S]|\x1dV[\s\S]/g, '');
    expect(text.split('\n').every((line) => line.replace(/\r/g, '').length <= columns)).toBe(true);
    expect(text.match(/PRODUCTO/g)).toHaveLength(16);
  });
  it('labels an explicit reprint and leaves the source snapshot intact', async () => {
    const doc = document(),
      before = structuredClone(doc);
    const original = await format(doc);
    const reprint = await format(doc, { mode: 'REPRINT', confirmed: true });
    expect(String.fromCharCode(...reprint)).toContain('REIMPRESION');
    expect(reprint).not.toEqual(original);
    expect(doc).toEqual(before);
  });
  it('rejects REPORT thermal formatting', async () => {
    await expect(format(document('REPORT'))).rejects.toMatchObject({ status: 422 });
  });
});

describe('T118 document transport (T128 red phase)', () => {
  it('freezes prepared bytes and blocks tests, prints and reconnects while sending', async () => {
    const s = transport();
    await s.connect();
    const bytes = new Uint8Array(transportBytes);
    const before = Array.from(bytes);
    let release!: () => void;
    s.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = s.print(document(), { bytes });
    expect(s.adapter.getSnapshot().state).toBe('PRINTING');
    expect(await s.adapter.test()).toEqual({ state: 'FAILED', errorCode: 'BUSY' });
    expect(await s.print()).toEqual({ state: 'FAILED', errorCode: 'BUSY' });
    await expect(s.connect()).rejects.toMatchObject({ code: 'BUSY' });
    bytes.fill(0);
    release();
    expect(await pending).toEqual({ state: 'SUCCEEDED' });
    expect(s.write.mock.calls.flatMap(([chunk]) => Array.from(chunk))).toEqual(before);
    expect(s.adapter.getSnapshot().state).toBe('CONNECTED');
  });
  it('requires explicit reprint after reconnecting from an uncertain PRINT', async () => {
    const s = transport();
    await s.connect();
    s.write.mockRejectedValueOnce(new Error('uncertain'));
    expect(await s.print()).toMatchObject({ state: 'UNKNOWN' });
    await s.connect();
    s.write.mockClear();
    await expect(s.print()).rejects.toMatchObject({ code: 'REPRINT_CONFIRMATION_REQUIRED' });
    expect(s.write).not.toHaveBeenCalled();
  });
  it('stops without another write when disconnected during an inter-chunk delay', async () => {
    vi.useFakeTimers();
    const s = transport({ interChunkDelayMs: 50 });
    await s.connect();
    const pending = s.print();
    await Promise.resolve();
    expect(s.write).toHaveBeenCalledTimes(1);
    s.adapter.disconnect();
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ state: 'UNKNOWN' });
    expect(s.write).toHaveBeenCalledTimes(1);
  });
  it.each(['PENDING', 'FAILED'])('rejects %s documents before writing', async (state) => {
    const s = transport();
    await s.connect();
    await expect(s.print({ ...document(), state })).rejects.toMatchObject({ status: 409 });
    expect(s.write).not.toHaveBeenCalled();
  });
  it('rejects empty bytes and invalid source pairs', async () => {
    const s = transport();
    await s.connect();
    await expect(s.print(document(), { bytes: new Uint8Array() })).rejects.toMatchObject({
      status: 422,
    });
    await expect(s.print({ ...document(), sourceType: 'CASH_CLOSE' })).rejects.toMatchObject({
      status: 422,
    });
    expect(s.write).not.toHaveBeenCalled();
  });
  it('rechecks browser policy before writing on an existing connection', async () => {
    const s = transport();
    await s.connect();
    vi.stubGlobal('document', { permissionsPolicy: { allowsFeature: () => false } });
    expect(await s.print()).toEqual({ state: 'FAILED', errorCode: 'POLICY_DENIED' });
    expect(s.write).not.toHaveBeenCalled();
  });
  it('honors the configured delay between consecutive chunks', async () => {
    const s = transport({ interChunkDelayMs: 50 });
    await s.connect();
    const times: number[] = [];
    s.write.mockImplementation(async () => {
      times.push(Date.now());
    });
    expect(await s.print()).toMatchObject({ state: 'SUCCEEDED' });
    expect(times.length).toBeGreaterThan(1);
    expect(times.slice(1).every((time, index) => time - times[index]! >= 45)).toBe(true);
  });
  it.each(['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE'])(
    'sends %s bytes in order, in bounded chunks',
    async (type) => {
      const s = transport();
      await s.connect();
      const doc = document(type),
        before = structuredClone(doc);
      const expected = transportBytes;
      expect(await s.print(doc)).toMatchObject({ state: 'SUCCEEDED' });
      expect(s.write.mock.calls.length).toBeGreaterThan(1);
      expect(s.write.mock.calls.every(([chunk]) => chunk.length <= 8)).toBe(true);
      expect(s.write.mock.calls.flatMap(([chunk]) => Array.from(chunk))).toEqual(
        Array.from(expected),
      );
      expect(doc).toEqual(before);
    },
  );
  it('awaits each write before sending the next chunk', async () => {
    const s = transport();
    await s.connect();
    let release!: () => void;
    s.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = s.print();
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(s.write).toHaveBeenCalledTimes(1);
    release();
    expect(await pending).toMatchObject({ state: 'SUCCEEDED' });
  });
  it('fails before any bytes when disconnected', async () => {
    const s = transport();
    expect(await s.print()).toMatchObject({ state: 'FAILED' });
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each(['first', 'partial', 'final'])(
    'returns UNKNOWN after an ambiguous %s write without automatic retry',
    async (position) => {
      const s = transport(position === 'final' ? { maxChunkBytes: 1024 } : {});
      await s.connect();
      if (position === 'partial') s.write.mockResolvedValueOnce(undefined);
      s.write.mockImplementationOnce(async () => {
        s.gatt.connected = false;
        s.events.dispatchEvent(new Event('gattserverdisconnected'));
        throw new DOMException('Link lost', 'NetworkError');
      });
      expect(await s.print()).toMatchObject({ state: 'UNKNOWN' });
      expect(s.write).toHaveBeenCalledTimes(position === 'partial' ? 2 : 1);
      expect(s.adapter.getSnapshot().state).toBe('DISCONNECTED');
    },
  );
  it('requires explicit REPRINT confirmation after UNKNOWN and never mutates the source', async () => {
    const s = transport();
    await s.connect();
    const doc = document(),
      before = structuredClone(doc);
    s.write.mockRejectedValueOnce(new Error('Uncertain write'));
    expect(await s.print(doc)).toMatchObject({ state: 'UNKNOWN' });
    await s.connect();
    s.write.mockClear();
    await expect(s.print(doc, { mode: 'REPRINT', confirmed: false })).rejects.toThrow();
    expect(s.write).not.toHaveBeenCalled();
    expect(await s.print(doc, { mode: 'REPRINT', confirmed: true })).toMatchObject({
      state: 'SUCCEEDED',
    });
    expect(doc).toEqual(before);
  });
  it.each(['PRINT', 'REPRINT'])('rejects REPORT %s before writing', async (mode) => {
    const s = transport();
    await s.connect();
    await expect(s.print(document('REPORT'), { mode, confirmed: true })).rejects.toMatchObject({
      status: 422,
    });
    expect(s.write).not.toHaveBeenCalled();
  });
  it('rejects an unconfirmed route load before writing', async () => {
    const s = transport();
    await s.connect();
    await expect(
      s.print({ ...document('ROUTE_LOAD'), sourceState: 'DRAFT' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(s.write).not.toHaveBeenCalled();
  });
});

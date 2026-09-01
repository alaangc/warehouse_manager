export function scaledQuantity(value: string): bigint {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0').slice(0, 3));
  return negative ? -scaled : scaled;
}

export function quantityFromScaled(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1000n;
  const fraction = (absolute % 1000n).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

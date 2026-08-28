const operationKeys = new Map<string, string>();

export function idempotencyKey(operationId: string): string {
  let key = operationKeys.get(operationId);
  if (!key) {
    key = crypto.randomUUID();
    operationKeys.set(operationId, key);
  }
  return key;
}

export function completeIdempotentOperation(operationId: string): void {
  operationKeys.delete(operationId);
}

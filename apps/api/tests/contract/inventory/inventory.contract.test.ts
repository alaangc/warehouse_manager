import {
  InventoryOperationRequestSchema,
  InventoryTransferRequestSchema,
  ProductWriteSchema,
} from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';

describe('inventory contract schemas', () => {
  it('accepts decimal strings and rejects numeric quantities', () => {
    const valid = {
      operationType: 'ENTRY',
      branchId: crypto.randomUUID(),
      reason: 'Initial stock',
      lines: [{ productId: crypto.randomUUID(), quantity: '12.500' }],
    };
    expect(InventoryOperationRequestSchema.parse(valid)).toEqual(valid);
    expect(() =>
      InventoryOperationRequestSchema.parse({
        ...valid,
        lines: [{ ...valid.lines[0], quantity: 12.5 }],
      }),
    ).toThrow();
  });

  it('rejects same-branch transfers and malformed products', () => {
    const branchId = crypto.randomUUID();
    expect(() =>
      InventoryTransferRequestSchema.parse({
        sourceBranchId: branchId,
        destinationBranchId: branchId,
        reason: 'Move',
        lines: [{ productId: crypto.randomUUID(), quantity: '1' }],
      }),
    ).toThrow();
    expect(() =>
      ProductWriteSchema.parse({
        sku: 'A',
        name: 'A',
        categoryId: crypto.randomUUID(),
        unitId: crypto.randomUUID(),
        standardUnitPrice: 1.25,
        lowStockThreshold: '0',
      }),
    ).toThrow();
  });
});

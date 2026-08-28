import { z } from 'zod';
import { PositiveQuantitySchema } from './common-schemas.js';

export const InventoryOperationTypeSchema = z.enum([
  'ENTRY',
  'MANUAL_EXIT',
  'POSITIVE_ADJUSTMENT',
  'NEGATIVE_ADJUSTMENT',
]);
export const InventoryLineSchema = z
  .object({ productId: z.uuid(), quantity: PositiveQuantitySchema })
  .strict();
export const InventoryOperationRequestSchema = z
  .object({
    operationType: InventoryOperationTypeSchema,
    branchId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
    lines: z.array(InventoryLineSchema).min(1).max(200),
  })
  .strict();
export const InventoryTransferRequestSchema = z
  .object({
    sourceBranchId: z.uuid(),
    destinationBranchId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
    lines: z.array(InventoryLineSchema).min(1).max(200),
  })
  .strict()
  .refine((value) => value.sourceBranchId !== value.destinationBranchId, {
    message: 'Source and destination must differ',
    path: ['destinationBranchId'],
  });
export const ReversalRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

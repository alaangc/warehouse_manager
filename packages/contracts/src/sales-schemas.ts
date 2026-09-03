import { z } from 'zod';
import { PaginationSchema, PositiveQuantitySchema } from './common-schemas.js';

export const PaymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'CARD']);
export const SaleLineRequestSchema = z
  .object({ productId: z.uuid(), quantity: PositiveQuantitySchema })
  .strict();
export const SaleQuoteRequestSchema = z
  .object({
    customerId: z.uuid(),
    routeId: z.uuid(),
    lines: z.array(SaleLineRequestSchema).min(1).max(100),
  })
  .strict();
export const SaleCreateRequestSchema = SaleQuoteRequestSchema.extend({
  clientOperationId: z.uuid(),
  paymentMethod: PaymentMethodSchema,
}).strict();
export const SaleCancellationRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const SaleListQuerySchema = PaginationSchema.extend({
  customerId: z.uuid().optional(),
  driverId: z.uuid().optional(),
  routeId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
})
  .strict()
  .refine((value) => !value.from || !value.to || value.from < value.to, {
    message: 'The start time must be before the end time',
    path: ['to'],
  });

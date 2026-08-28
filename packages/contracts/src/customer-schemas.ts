import { z } from 'zod';
import { UnitPriceSchema } from './common-schemas.js';

export const CustomerWriteSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    contactName: z.string().trim().max(160).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z.email().nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    city: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export const CustomerUpdateSchema = CustomerWriteSchema.extend({
  expectedVersion: z.number().int().positive(),
  active: z.boolean(),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
}).strict();
export const CustomerPriceWriteSchema = z
  .object({
    productId: z.uuid(),
    unitPrice: UnitPriceSchema,
    validFrom: z.iso.datetime(),
    validTo: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine((value) => !value.validTo || new Date(value.validTo) > new Date(value.validFrom), {
    path: ['validTo'],
    message: 'validTo must be after validFrom',
  });
export const CustomerPriceDeactivateSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

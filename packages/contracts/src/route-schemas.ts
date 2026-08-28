import { z } from 'zod';
import { PositiveQuantitySchema, QuantitySchema } from './common-schemas.js';

export const RouteStateSchema = z.enum(['PREPARING', 'EN_ROUTE', 'RETURNED', 'CLOSED']);
export const RouteCreateSchema = z
  .object({
    routeNumber: z.string().trim().min(1).max(64).optional(),
    originLocationId: z.uuid(),
    driverId: z.uuid(),
    vehicleId: z.uuid(),
    businessDate: z.iso.date(),
  })
  .strict();
export const RouteLoadLineSchema = z
  .object({ productId: z.uuid(), quantity: PositiveQuantitySchema })
  .strict();
export const RouteLoadDraftSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    lines: z.array(RouteLoadLineSchema).min(1).max(200),
  })
  .strict();
export const RouteTransitionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const RouteReconciliationLineSchema = z
  .object({
    productId: z.uuid(),
    physicalReturnQuantity: QuantitySchema,
    differenceReason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();
export const RouteReconciliationSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    lines: z.array(RouteReconciliationLineSchema).min(1).max(200),
  })
  .strict();

import { z } from 'zod';
import { QuantitySchema, UnitPriceSchema } from './common-schemas.js';

const code = z.string().trim().min(1).max(64);
const name = z.string().trim().min(1).max(160);
export const ReportingGroupSchema = z.enum(['SODAS', 'CHARCOAL', 'TOSTADAS', 'OTHER']);
export const LocationWriteSchema = z.object({ code: code.max(32), name: name.max(120) }).strict();
export const CategoryWriteSchema = z
  .object({ name: name.max(120), reportingGroup: ReportingGroupSchema })
  .strict();
export const UnitWriteSchema = z
  .object({ code: code.max(32), name: name.max(80), quantityScale: z.number().int().min(0).max(3) })
  .strict();
export const VehicleWriteSchema = z
  .object({
    code: code.max(32),
    name: name.max(120),
    registration: z.string().trim().max(64).nullable().optional(),
  })
  .strict();
export const ProductWriteSchema = z
  .object({
    sku: code,
    name,
    description: z.string().trim().max(1000).nullable().optional(),
    categoryId: z.uuid(),
    unitId: z.uuid(),
    standardUnitPrice: UnitPriceSchema,
    lowStockThreshold: QuantitySchema,
  })
  .strict();
export const CatalogUpdateFieldsSchema = z.object({
  expectedVersion: z.number().int().positive(),
  active: z.boolean(),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
});
export const LocationUpdateSchema = LocationWriteSchema.extend(
  CatalogUpdateFieldsSchema.shape,
).strict();
export const CategoryUpdateSchema = CategoryWriteSchema.extend(
  CatalogUpdateFieldsSchema.shape,
).strict();
export const UnitUpdateSchema = UnitWriteSchema.extend(CatalogUpdateFieldsSchema.shape).strict();
export const VehicleUpdateSchema = VehicleWriteSchema.extend(
  CatalogUpdateFieldsSchema.shape,
).strict();
export const ProductUpdateSchema = ProductWriteSchema.extend(
  CatalogUpdateFieldsSchema.shape,
).strict();

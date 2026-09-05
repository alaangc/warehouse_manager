import { z } from 'zod';
import { NonnegativeMoneySchema, PaginationSchema } from './common-schemas.js';

export const ReportingPeriodKindSchema = z.enum(['DAY', 'WEEK', 'MONTH']);
export const ReportingPeriodRequestSchema = z
  .object({
    periodKind: ReportingPeriodKindSchema,
    anchorDate: z.iso.date(),
  })
  .strict();
export const CashCloseCreateSchema = ReportingPeriodRequestSchema;
export const CashCloseCorrectionSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const CashCloseListSchema = PaginationSchema.extend({
  periodKind: ReportingPeriodKindSchema.optional(),
  anchorDate: z.iso.date().optional(),
  status: z.enum(['CURRENT', 'SUPERSEDED']).optional(),
})
  .strict()
  .refine((input) => (input.periodKind === undefined) === (input.anchorDate === undefined), {
    message: 'periodKind and anchorDate must be provided together',
  });
export const ReportTypeSchema = z.enum([
  'SALES_BY_DRIVER',
  'BEST_SELLING_PRODUCTS',
  'INVENTORY_BY_BRANCH',
  'FINANCIAL_SUMMARY',
]);
export const ReportSnapshotCreateSchema = z.discriminatedUnion('reportType', [
  z
    .object({ reportType: z.literal('INVENTORY_BY_BRANCH'), filters: z.object({}).strict() })
    .strict(),
  z
    .object({
      reportType: z.enum(['SALES_BY_DRIVER', 'BEST_SELLING_PRODUCTS', 'FINANCIAL_SUMMARY']),
      filters: ReportingPeriodRequestSchema,
    })
    .strict(),
]);
export const CashCloseResourceSchema = z
  .object({
    id: z.uuid(),
    closeNumber: z.string(),
    periodKind: ReportingPeriodKindSchema,
    anchorDate: z.iso.date(),
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
    businessTimezone: z.string(),
    status: z.enum(['CURRENT', 'SUPERSEDED']),
    supersedesCashCloseId: z.uuid().nullable(),
    supersededByCashCloseId: z.uuid().nullable(),
    correctionReason: z.string().nullable(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    grossTotal: NonnegativeMoneySchema,
    partnerRate: z.literal('0.500000'),
    partnerAmount: NonnegativeMoneySchema,
    remainingAmount: NonnegativeMoneySchema,
    roundingMode: z.literal('HALF_AWAY_FROM_ZERO'),
    lines: z.array(
      z
        .object({
          reportingGroup: z.enum(['SODAS', 'CHARCOAL', 'TOSTADAS', 'OTHER']),
          total: NonnegativeMoneySchema,
        })
        .strict(),
    ),
    contributingSaleIds: z.array(z.uuid()),
    createdBy: z.uuid(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const ReportResourceSchema = z
  .object({
    reportType: ReportTypeSchema,
    generatedAt: z.iso.datetime(),
    businessTimezone: z.string(),
    filters: z.record(z.string(), z.unknown()),
    rows: z.array(z.record(z.string(), z.unknown())),
    totals: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export const ReportSnapshotResourceSchema = z
  .object({
    id: z.uuid(),
    reportType: ReportTypeSchema,
    filters: z.record(z.string(), z.unknown()),
    businessTimezone: z.string(),
    sourceWatermark: z.string(),
    result: z.record(z.string(), z.unknown()),
    createdBy: z.uuid(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type CashCloseResource = z.infer<typeof CashCloseResourceSchema>;
export type ReportResource = z.infer<typeof ReportResourceSchema>;

import { z } from 'zod';
import { registerSchema } from './registry.js';

export const DocumentTypeSchema = registerSchema(
  'DocumentType',
  z.enum(['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT']),
);
export const DocumentCreateSchema = registerSchema(
  'DocumentCreateRequest',
  z.discriminatedUnion('documentType', [
    z
      .object({
        documentType: z.literal('TICKET'),
        sourceType: z.literal('SALE'),
        sourceId: z.uuid(),
      })
      .strict(),
    z
      .object({
        documentType: z.literal('ROUTE_LOAD'),
        sourceType: z.literal('ROUTE_LOAD'),
        sourceId: z.uuid(),
      })
      .strict(),
    z
      .object({
        documentType: z.literal('CASH_CLOSE'),
        sourceType: z.literal('CASH_CLOSE'),
        sourceId: z.uuid(),
      })
      .strict(),
    z
      .object({
        documentType: z.literal('REPORT'),
        sourceType: z.literal('REPORT_SNAPSHOT'),
        sourceId: z.uuid(),
      })
      .strict(),
  ]),
);
export const DocumentHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(4096).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export const DocumentListQuerySchema = DocumentHistoryQuerySchema.extend({
  documentType: DocumentTypeSchema.optional(),
  sourceType: z.enum(['SALE', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT_SNAPSHOT']).optional(),
  sourceId: z.uuid().optional(),
  state: z.enum(['PENDING', 'READY', 'FAILED']).optional(),
}).strict();
export const DocumentResourceSchema = registerSchema(
  'DocumentOutput',
  z
    .object({
      id: z.uuid(),
      documentType: DocumentTypeSchema,
      sourceType: z.string(),
      sourceId: z.uuid(),
      contentVersion: z.string(),
      contentHash: z.string().nullable().optional(),
      state: z.enum(['PENDING', 'READY', 'FAILED']),
      createdBy: z.uuid(),
      createdAt: z.iso.datetime(),
      readyAt: z.iso.datetime().nullable().optional(),
      lastErrorCode: z.string().nullable().optional(),
    })
    .strict(),
);
export type DocumentResource = z.infer<typeof DocumentResourceSchema>;
export type DocumentCreateRequest = z.infer<typeof DocumentCreateSchema>;

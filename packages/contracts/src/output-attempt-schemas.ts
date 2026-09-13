import { z } from 'zod';
import { registerSchema } from './registry.js';
import { DocumentHistoryQuerySchema } from './document-schemas.js';

export const OutputModeSchema = z.enum([
  'GENERATE',
  'DOWNLOAD',
  'SHARE',
  'PRINT',
  'REPRINT',
  'TEST_PRINT',
]);
export const OutputStateSchema = z.enum(['STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN']);
const common = {
  state: OutputStateSchema,
  errorCode: z.string().max(120).nullable().optional(),
  requestId: z.string().max(200).nullable().optional(),
};
export const OutputAttemptRequestSchema = registerSchema(
  'OutputAttemptRequest',
  z.discriminatedUnion('mode', [
    z
      .object({ ...common, mode: z.enum(['GENERATE', 'DOWNLOAD', 'SHARE']), documentId: z.uuid() })
      .strict(),
    z
      .object({
        ...common,
        mode: z.enum(['PRINT', 'REPRINT']),
        documentId: z.uuid(),
        printerProfileId: z.uuid(),
      })
      .strict(),
    z.object({ ...common, mode: z.literal('TEST_PRINT'), printerProfileId: z.uuid() }).strict(),
  ]),
);
export const OutputAttemptListQuerySchema = DocumentHistoryQuerySchema.extend({
  documentId: z.uuid().optional(),
  mode: OutputModeSchema.optional(),
  state: OutputStateSchema.optional(),
}).strict();
export const OutputAttemptResourceSchema = registerSchema(
  'OutputAttempt',
  z
    .object({
      id: z.uuid(),
      actorId: z.uuid(),
      documentId: z.uuid().nullable().optional(),
      mode: OutputModeSchema,
      state: OutputStateSchema,
      attemptNumber: z.number().int().positive(),
      createdAt: z.iso.datetime(),
      printerProfileId: z.uuid().nullable().optional(),
      errorCode: z.string().nullable().optional(),
      requestId: z.string().nullable().optional(),
    })
    .strict(),
);
export type OutputAttemptResource = z.infer<typeof OutputAttemptResourceSchema>;
export type OutputAttemptRequest = z.infer<typeof OutputAttemptRequestSchema>;

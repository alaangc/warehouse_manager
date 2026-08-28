import { z } from 'zod';
import { registerSchema } from './registry.js';

export const ProblemSchema = registerSchema(
  'Problem',
  z
    .object({
      type: z.url(),
      title: z.string(),
      status: z.number().int().min(400).max(599),
      code: z.string(),
      detail: z.string().optional(),
      instance: z.string().optional(),
      requestId: z.string().optional(),
      errors: z.record(z.string(), z.array(z.string())).optional(),
    })
    .passthrough(),
);
export type Problem = z.infer<typeof ProblemSchema>;

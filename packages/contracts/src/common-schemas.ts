import { z } from 'zod';
import { registerSchema } from './registry.js';

export const UuidSchema = registerSchema('Uuid', z.uuid());
export const QuantitySchema = registerSchema(
  'Quantity',
  z.string().regex(/^(0|[1-9]\d*)(\.\d{1,3})?$/),
);
export const PositiveQuantitySchema = registerSchema(
  'PositiveQuantity',
  z.string().regex(/^(?:0\.00[1-9]|0\.0[1-9]\d?|0\.[1-9]\d{0,2}|[1-9]\d*(?:\.\d{1,3})?)$/),
);
export const MoneySchema = registerSchema('Money', z.string().regex(/^-?(0|[1-9]\d*)\.\d{2}$/));
export const NonnegativeMoneySchema = registerSchema(
  'NonnegativeMoney',
  z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/),
);
export const UnitPriceSchema = registerSchema(
  'UnitPrice',
  z.string().regex(/^(0|[1-9]\d*)(\.\d{1,4})?$/),
);
export const PaginationSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const UserRoleSchema = registerSchema('UserRole', z.enum(['ADMINISTRATOR', 'DRIVER']));
export const LoginRequestSchema = registerSchema(
  'LoginRequest',
  z
    .object({ username: z.string().trim().min(1).max(120), password: z.string().min(8).max(1024) })
    .strict(),
);
export const SessionUserSchema = registerSchema(
  'SessionUser',
  z
    .object({
      id: z.uuid(),
      username: z.string(),
      displayName: z.string(),
      role: UserRoleSchema,
      active: z.boolean(),
    })
    .strict(),
);
export const SessionResponseSchema = registerSchema(
  'SessionResponse',
  z.object({ data: SessionUserSchema }).strict(),
);

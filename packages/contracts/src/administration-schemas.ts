import { z } from 'zod';
import { registerSchema } from './registry.js';

const role = z.enum(['ADMINISTRATOR', 'DRIVER']);
const version = z.number().int().positive();
const reason = z.string().trim().min(1).max(500);
const password = z.string().min(12).max(1024);
export const UserCreateSchema = registerSchema(
  'UserCreateRequest',
  z
    .object({
      username: z.string().trim().min(1).max(120),
      displayName: z.string().trim().min(1).max(160),
      role,
      password,
    })
    .strict(),
);
export const UserUpdateSchema = registerSchema(
  'UserUpdateRequest',
  z
    .object({
      expectedVersion: version,
      displayName: z.string().trim().min(1).max(160).optional(),
      role: role.optional(),
      active: z.boolean().optional(),
      password: password.optional(),
      reason: reason.optional(),
    })
    .strict(),
);
export const UserListQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .default(25),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();
export const UserResourceSchema = registerSchema(
  'User',
  z
    .object({
      id: z.uuid(),
      username: z.string(),
      displayName: z.string(),
      role,
      active: z.boolean(),
      version,
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
      archivedAt: z.iso.datetime().nullable(),
    })
    .strict(),
);
export const BusinessSettingUpdateSchema = registerSchema(
  'BusinessSettingUpdateRequest',
  z
    .object({
      expectedVersion: version,
      currencyCode: z.string().regex(/^[A-Z]{3}$/),
      businessTimezone: z.string().trim().min(1).max(100),
      reason,
    })
    .strict(),
);
export const BusinessSettingResourceSchema = registerSchema(
  'BusinessSetting',
  z
    .object({
      currencyCode: z.string().regex(/^[A-Z]{3}$/),
      currencyScale: z.literal(2),
      businessTimezone: z.string(),
      partnerShareRate: z.literal('0.500000'),
      moneyRoundingMode: z.literal('HALF_AWAY_FROM_ZERO'),
      version,
    })
    .strict(),
);
export const PrinterProfileWriteSchema = registerSchema(
  'PrinterProfileWriteRequest',
  z
    .object({
      name: z.string().trim().min(1).max(120),
      model: z.string().trim().min(1).max(120),
      serviceUuid: z.string().min(1).max(64),
      writeCharacteristicUuid: z.string().min(1).max(64),
      writeMode: z.enum(['WITH_RESPONSE', 'WITHOUT_RESPONSE']),
      commandDialect: z.literal('ESC_POS'),
      paperWidthMm: z.union([z.literal(58), z.literal(80)]),
      encoding: z.enum(['CP850', 'CP437', 'UTF-8']),
      maxChunkBytes: z.number().int().min(1).max(1024),
      interChunkDelayMs: z.number().int().min(0).max(5000),
    })
    .strict(),
);
export const PrinterProfileUpdateSchema = registerSchema(
  'PrinterProfileUpdateRequest',
  PrinterProfileWriteSchema.extend({
    expectedVersion: version,
    active: z.boolean(),
    reason: z.string().max(500).nullable().optional(),
  }),
);
export const PrinterProfileResourceSchema = registerSchema(
  'PrinterProfile',
  PrinterProfileWriteSchema.extend({
    id: z.uuid(),
    transport: z.literal('WEB_BLUETOOTH_BLE'),
    active: z.boolean(),
    version,
  }),
);
export const PrinterPreferenceSchema = registerSchema(
  'PrinterPreferenceRequest',
  z
    .object({
      printerProfileId: z.uuid(),
      deviceLabel: z.string().max(120).nullable().optional(),
      testedBrowser: z.string().max(120).nullable().optional(),
      testedOs: z.string().max(120).nullable().optional(),
      lastTestResult: z.enum(['SUCCEEDED', 'FAILED', 'UNKNOWN']).nullable().optional(),
    })
    .strict(),
);
export const PrinterPreferenceResourceSchema = PrinterPreferenceSchema.extend({
  lastTestedAt: z.iso.datetime().nullable(),
}).nullable();
export const TestPrintRequestSchema = registerSchema(
  'TestPrintRequest',
  z
    .object({
      mode: z.literal('TEST_PRINT'),
      printerProfileId: z.uuid(),
      state: z.enum(['STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN']),
      errorCode: z.string().max(120).nullable().optional(),
      requestId: z.string().max(200).nullable().optional(),
    })
    .strict(),
);
export const TestPrintResourceSchema = TestPrintRequestSchema.extend({
  id: z.uuid(),
  actorId: z.uuid(),
  documentId: z.null(),
  attemptNumber: version,
  createdAt: z.iso.datetime(),
});
const OverviewRouteSchema = z
  .object({
    id: z.uuid(),
    driverId: z.uuid(),
    state: z.enum(['PREPARING', 'EN_ROUTE', 'RETURNED']),
  })
  .strict();
export const DriverOverviewSchema = z
  .object({
    actions: z.array(z.string()),
    routes: z.array(OverviewRouteSchema),
  })
  .strict();
export const AdministratorOverviewSchema = DriverOverviewSchema.extend({
  grossTotal: z.string().regex(/^(0|[1-9][0-9]*)\.[0-9]{2}$/),
  lowStockCount: z.number().int().nonnegative(),
});
export const OverviewResourceSchema = registerSchema(
  'RoleOverview',
  z.union([AdministratorOverviewSchema, DriverOverviewSchema]),
);
export type RoleOverview = z.infer<typeof OverviewResourceSchema>;

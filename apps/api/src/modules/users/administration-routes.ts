import {
  BusinessSettingResourceSchema,
  BusinessSettingUpdateSchema,
  PrinterPreferenceResourceSchema,
  PrinterPreferenceSchema,
  PrinterProfileResourceSchema,
  PrinterProfileUpdateSchema,
  PrinterProfileWriteSchema,
  TestPrintRequestSchema,
  TestPrintResourceSchema,
  UserCreateSchema,
  UserListQuerySchema,
  UserResourceSchema,
  UserUpdateSchema,
} from '@warehouse/contracts';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuthenticated, requireRole } from '../../auth/authorization.js';
import type { AppDatabase } from '../../db/database.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { BusinessSettingsService } from '../settings/business-settings-service.js';
import { PrinterSettingsService } from '../printers/printer-settings-service.js';
import { UserAdminService } from './user-admin-service.js';
import { AdministrationError } from './user-domain.js';

function context(request: Request) {
  return {
    actorId: request.principal!.id,
    requestId:
      typeof request.id === 'string' || typeof request.id === 'number'
        ? String(request.id)
        : 'unknown',
  };
}
// Response failures are server defects, never invalid client input (422).
function resource<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpProblem(500, 'RESPONSE_INVALID', 'Internal Server Error');
  return parsed.data;
}
function endpoint(handler: RequestHandler): RequestHandler {
  return async (request, response, next) => {
    try {
      await handler(request, response, next);
    } catch (error) {
      if (error instanceof AdministrationError) {
        const status = error.code === 'USER_ACTIVE_ROUTE' ? 409 : 422;
        next(
          new HttpProblem(
            status,
            error.code,
            status === 409 ? 'Conflict' : 'Validation Failed',
            error.message,
          ),
        );
      } else if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        next(new HttpProblem(409, 'RESOURCE_DUPLICATE', 'Conflict'));
      } else next(error);
    }
  };
}
export function createAdministrationRouter(database: AppDatabase): Router {
  const router = Router();
  const users = new UserAdminService(database);
  const settings = new BusinessSettingsService(database);
  const printers = new PrinterSettingsService(database);
  const admin = requireRole('ADMINISTRATOR');
  router.use(requireAuthenticated);
  router.get(
    '/users',
    admin,
    endpoint(async (request, response) => {
      const result = await users.list(
        UserListQuerySchema.parse(request.query),
        request.principal!.id,
      );
      response.json({
        data: resource(z.array(UserResourceSchema), result.data),
        page: { hasNextPage: result.page.hasMore, nextCursor: result.page.nextCursor },
      });
    }),
  );
  router.post(
    '/users',
    admin,
    endpoint(async (request, response) => {
      response.status(201).json({
        data: resource(
          UserResourceSchema,
          await users.create(UserCreateSchema.parse(request.body), context(request)),
        ),
      });
    }),
  );
  router.get(
    '/users/:userId',
    admin,
    endpoint(async (request, response) => {
      response.json({
        data: resource(UserResourceSchema, await users.get(z.uuid().parse(request.params.userId))),
      });
    }),
  );
  router.patch(
    '/users/:userId',
    admin,
    endpoint(async (request, response) => {
      response.json({
        data: resource(
          UserResourceSchema,
          await users.update(
            z.uuid().parse(request.params.userId),
            UserUpdateSchema.parse(request.body),
            context(request),
          ),
        ),
      });
    }),
  );
  router.get(
    '/settings/business',
    admin,
    endpoint(async (_request, response) => {
      const { id: _id, ...data } = await settings.get();
      void _id;
      response.json({ data: resource(BusinessSettingResourceSchema, data) });
    }),
  );
  router.patch(
    '/settings/business',
    admin,
    endpoint(async (request, response) => {
      const { id: _id, ...data } = await settings.update(
        BusinessSettingUpdateSchema.parse(request.body),
        context(request),
      );
      void _id;
      response.json({ data: resource(BusinessSettingResourceSchema, data) });
    }),
  );
  router.get(
    '/printer-profiles',
    endpoint(async (request, response) => {
      z.object({}).strict().parse(request.query);
      response.json({
        data: resource(
          z.array(PrinterProfileResourceSchema),
          await printers.list(request.principal!.role === 'ADMINISTRATOR'),
        ),
      });
    }),
  );
  router.post(
    '/printer-profiles',
    admin,
    endpoint(async (request, response) => {
      response.status(201).json({
        data: resource(
          PrinterProfileResourceSchema,
          await printers.create(PrinterProfileWriteSchema.parse(request.body), context(request)),
        ),
      });
    }),
  );
  router.patch(
    '/printer-profiles/:printerProfileId',
    admin,
    endpoint(async (request, response) => {
      response.json({
        data: resource(
          PrinterProfileResourceSchema,
          await printers.update(
            z.uuid().parse(request.params.printerProfileId),
            PrinterProfileUpdateSchema.parse(request.body),
            context(request),
          ),
        ),
      });
    }),
  );
  router.get(
    '/me/printer-preference',
    endpoint(async (request, response) => {
      z.object({}).strict().parse(request.query);
      response.json({
        data: resource(
          PrinterPreferenceResourceSchema,
          await printers.getPreference(request.principal!.id),
        ),
      });
    }),
  );
  router.put(
    '/me/printer-preference',
    endpoint(async (request, response) => {
      response.json({
        data: resource(
          PrinterPreferenceResourceSchema,
          await printers.setPreference(
            PrinterPreferenceSchema.parse(request.body),
            context(request),
          ),
        ),
      });
    }),
  );
  router.post(
    '/output-attempts',
    endpoint(async (request, response) => {
      response.status(201).json({
        data: resource(
          TestPrintResourceSchema,
          await printers.recordTestPrint(
            TestPrintRequestSchema.parse(request.body),
            context(request),
          ),
        ),
      });
    }),
  );
  return router;
}

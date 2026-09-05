import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  CashCloseCreateSchema,
  CashCloseCorrectionSchema,
  CashCloseListSchema,
  CashCloseResourceSchema,
  ReportingPeriodRequestSchema,
  ReportSnapshotCreateSchema,
  ReportSnapshotResourceSchema,
  ReportResourceSchema,
} from '@warehouse/contracts';
import { requireAuthenticated, requireRole } from '../../auth/authorization.js';
import type { AppDatabase } from '../../db/database.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';
import { CashCloseRepository, type CashCloseListFilters } from './cash-close-repository.js';
import { CashCloseService, cashCloseResource } from './cash-close-service.js';
import { ReportService } from './report-service.js';
import { resolveReportingPeriod, ReportingPeriodError } from './reporting-period.js';
import { ReportingError } from './report-command.js';

function commandContext(request: Request) {
  const key = request.header('Idempotency-Key');
  if (!key || key.length < 16 || key.length > 128)
    throw new HttpProblem(422, 'IDEMPOTENCY_KEY_INVALID', 'Validation Failed');
  return {
    actorId: request.principal!.id,
    idempotencyKey: key,
    requestId:
      typeof request.id === 'string' || typeof request.id === 'number'
        ? String(request.id)
        : 'unknown',
  };
}

function periodInput(value: unknown) {
  const parsed = ReportingPeriodRequestSchema.safeParse(value);
  if (!parsed.success) throw new ReportingPeriodError('The reporting period is invalid.');
  return parsed.data;
}

const cursorSchema = z
  .object({
    createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    id: z.uuid(),
    scope: z.string(),
  })
  .strict();

// Validate server output without presenting implementation validation details as a client error.
function output<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new Error('Reporting response failed its contract', { cause: parsed.error });
  return parsed.data;
}

export function createReportRouter(database: AppDatabase): Router {
  const router = Router();
  const closes = new CashCloseService(database);
  const reports = new ReportService(database);
  router.use(
    ['/reports', '/cash-closes', '/report-snapshots'],
    requireAuthenticated,
    requireRole('ADMINISTRATOR'),
  );

  for (const [path, reportType] of [
    ['sales-by-driver', 'SALES_BY_DRIVER'],
    ['best-selling-products', 'BEST_SELLING_PRODUCTS'],
    ['inventory-by-branch', 'INVENTORY_BY_BRANCH'],
    ['financial-summary', 'FINANCIAL_SUMMARY'],
  ] as const) {
    router.get(`/reports/${path}`, async (request, response, next) => {
      try {
        const filters =
          reportType === 'INVENTORY_BY_BRANCH'
            ? z.object({}).strict().parse(request.query)
            : periodInput(request.query);
        response.json({
          data: output(
            ReportResourceSchema,
            await reports.read({ reportType, filters }, request.principal!.id),
          ),
        });
      } catch (error) {
        next(error);
      }
    });
  }
  router.post('/report-snapshots', async (request, response, next) => {
    try {
      const input = ReportSnapshotCreateSchema.parse(request.body);
      response.status(201).json({
        data: output(
          ReportSnapshotResourceSchema,
          await reports.snapshot(input, commandContext(request)),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post('/cash-closes', async (request, response, next) => {
    try {
      const input = periodInput(request.body);
      response.status(201).json({
        data: output(
          CashCloseResourceSchema,
          await closes.create(CashCloseCreateSchema.parse(input), commandContext(request)),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/cash-closes', async (request, response, next) => {
    try {
      const parsed = CashCloseListSchema.safeParse(request.query);
      if (!parsed.success)
        throw new ReportingPeriodError('The reporting period or list filters are invalid.');
      const input = parsed.data;
      const page = await database
        .transaction()
        .setIsolationLevel('repeatable read')
        .execute(async (transaction) => {
          const filters: CashCloseListFilters = {
            limit: input.limit,
            ...(input.status ? { status: input.status } : {}),
          };
          if (input.periodKind && input.anchorDate) {
            const settings = await transaction
              .selectFrom('business_setting')
              .select('business_timezone')
              .executeTakeFirstOrThrow();
            filters.period = resolveReportingPeriod({
              periodKind: input.periodKind,
              anchorDate: input.anchorDate,
              businessTimezone: settings.business_timezone,
            });
          }
          const scope = canonicalRequestHash({
            actorId: request.principal!.id,
            period: filters.period
              ? {
                  businessTimezone: filters.period.businessTimezone,
                  periodStart: String(filters.period.periodStart),
                  periodEnd: String(filters.period.periodEnd),
                }
              : null,
            status: input.status ?? null,
          });
          if (input.cursor) {
            try {
              const cursor = cursorSchema.parse(
                JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')),
              );
              if (cursor.scope !== scope) throw new Error('Cursor scope mismatch');
              filters.cursor = { createdAt: cursor.createdAt, id: cursor.id };
            } catch {
              throw new HttpProblem(
                422,
                'INVALID_CURSOR',
                'Validation Failed',
                'The pagination cursor is invalid for these filters.',
              );
            }
          }
          const result = await new CashCloseRepository(transaction).list(filters);
          return {
            data: result.items.map((row) =>
              output(CashCloseResourceSchema, cashCloseResource(row)),
            ),
            page: {
              hasNextPage: result.hasNextPage,
              nextCursor: result.nextCursor
                ? Buffer.from(JSON.stringify({ ...result.nextCursor, scope })).toString('base64url')
                : null,
            },
          };
        });
      response.json(page);
    } catch (error) {
      next(error);
    }
  });
  router.get('/cash-closes/:cashCloseId', async (request, response, next) => {
    try {
      const id = z.uuid().parse(request.params.cashCloseId);
      const row = await database
        .transaction()
        .setIsolationLevel('repeatable read')
        .execute((tx) => new CashCloseRepository(tx).detail(id));
      if (!row) throw new ReportingError('CASH_CLOSE_NOT_FOUND', 'Cash close not found.');
      response.json({ data: output(CashCloseResourceSchema, cashCloseResource(row)) });
    } catch (error) {
      next(error);
    }
  });
  router.post('/cash-closes/:cashCloseId/corrections', async (request, response, next) => {
    try {
      const id = z.uuid().parse(request.params.cashCloseId);
      const { reason } = CashCloseCorrectionSchema.parse(request.body);
      response.status(201).json({
        data: output(
          CashCloseResourceSchema,
          await closes.correct(id, reason, commandContext(request)),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.use(
    (
      error: unknown,
      _request: Request,
      _response: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      if (error instanceof ReportingPeriodError)
        return next(new HttpProblem(422, error.code, 'Validation Failed', error.message));
      if (error instanceof ReportingError) {
        const status =
          error.code === 'REPORT_FORBIDDEN'
            ? 403
            : error.code === 'CASH_CLOSE_NOT_FOUND'
              ? 404
              : error.code === 'CASH_CLOSE_TOTAL_MISMATCH'
                ? 500
                : [
                      'CORRECTION_REASON_REQUIRED',
                      'INVALID_REPORT_FILTERS',
                      'INVALID_REPORT_TYPE',
                    ].includes(error.code)
                  ? 422
                  : 409;
        return next(
          new HttpProblem(
            status,
            error.code,
            status === 409
              ? 'Conflict'
              : status === 422
                ? 'Validation Failed'
                : status === 403
                  ? 'Forbidden'
                  : status === 404
                    ? 'Not Found'
                    : 'Internal Server Error',
            error.message,
          ),
        );
      }
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        ['40001', '40P01'].includes(String(error.code))
      )
        return next(
          new HttpProblem(
            409,
            'TRANSACTION_CONFLICT',
            'Conflict',
            'Concurrent activity prevented completion. Retry the request.',
          ),
        );
      next(error);
    },
  );
  return router;
}

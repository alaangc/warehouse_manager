import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  DocumentCreateSchema,
  DocumentListQuerySchema,
  DocumentResourceSchema,
  OutputAttemptListQuerySchema,
  OutputAttemptRequestSchema,
  OutputAttemptResourceSchema,
} from '@warehouse/contracts';
import { requireAuthenticated } from '../../auth/authorization.js';
import type { AppDatabase } from '../../db/database.js';
import type { Environment } from '../../config/env.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { ScopedCursor } from '../../shared/pagination/scoped-cursor.js';
import { DocumentRepository, type DocumentRow } from './document-repository.js';
import { OutputAttemptRepository, type OutputAttemptRow } from './output-attempt-repository.js';
import { DocumentService } from './document-service.js';
import { IdempotencyRepository } from '../../shared/idempotency/idempotency-repository.js';
import { canonicalRequestHash } from '../../shared/idempotency/idempotency-service.js';

function output<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpProblem(500, 'RESPONSE_INVALID', 'Internal Server Error');
  return result.data;
}
function documentResource(row: DocumentRow) {
  return output(DocumentResourceSchema, {
    id: row.id,
    documentType: row.document_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    contentVersion: row.content_version,
    contentHash: row.content_hash || null,
    state: row.state,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    readyAt: row.ready_at?.toISOString() ?? null,
    lastErrorCode: row.last_error_code,
  });
}
function attemptResource(row: OutputAttemptRow) {
  return output(OutputAttemptResourceSchema, {
    id: row.id,
    actorId: row.actor_id,
    documentId: row.document_output_id,
    mode: row.mode,
    state: row.state,
    attemptNumber: row.attempt_number,
    createdAt: row.created_at.toISOString(),
    printerProfileId: row.printer_profile_id,
    errorCode: row.error_code,
    requestId: row.request_id,
  });
}
function requestId(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : 'unknown';
}
function idempotencyKey(request: Request): string {
  const key = request.header('Idempotency-Key');
  if (!key || key.length < 16 || key.length > 128)
    throw new HttpProblem(422, 'IDEMPOTENCY_KEY_INVALID', 'Validation Failed');
  return key;
}

export function createDocumentRouter(database: AppDatabase, environment: Environment): Router {
  const router = Router();
  const cursors = new ScopedCursor(environment.SESSION_SECRET);
  const documents = new DocumentRepository(database, cursors);
  const attempts = new OutputAttemptRepository(database, cursors);
  const service = new DocumentService(database, cursors, environment.DOCUMENT_STORAGE_PATH);
  router.use(['/documents', '/output-attempts'], requireAuthenticated);
  router.get('/documents', async (request, response) => {
    const result = await documents.list(
      request.principal!,
      DocumentListQuerySchema.parse(request.query),
    );
    response.json({ data: result.data.map(documentResource), page: result.page });
  });
  router.post('/documents', async (request, response) => {
    const input = DocumentCreateSchema.parse(request.body);
    const key = idempotencyKey(request);
    await runSerializable(database, async (transaction) => {
      await new DocumentRepository(transaction, cursors).loadSource(request.principal!, input);
      const repository = new IdempotencyRepository();
      const acquired = await repository.acquire(transaction, {
        actorId: request.principal!.id,
        operationType: 'DOCUMENT_REQUEST',
        key,
        requestHash: canonicalRequestHash(z.json().parse(input)),
      });
      if (acquired.kind === 'hash_conflict' || acquired.kind === 'in_progress')
        throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Conflict');
      if (acquired.kind === 'acquired')
        await repository.complete(transaction, acquired.id, {
          resourceType: 'DOCUMENT_SOURCE',
          resourceId: input.sourceId,
          status: 202,
          body: input,
        });
    });
    response.status(202).json({
      data: documentResource(await service.request(request.principal!, input, requestId(request))),
    });
  });
  router.get('/documents/:documentId', async (request, response) => {
    response.json({
      data: documentResource(
        await service.status(request.principal!, z.uuid().parse(request.params.documentId)),
      ),
    });
  });
  router.get('/documents/:documentId/content', async (request, response) => {
    const result = await service.content(
      request.principal!,
      z.uuid().parse(request.params.documentId),
    );
    response
      .set({
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(result.bytes);
  });
  router.get('/output-attempts', async (request, response) => {
    const result = await attempts.list(
      request.principal!,
      OutputAttemptListQuerySchema.parse(request.query),
    );
    response.json({ data: result.data.map(attemptResource), page: result.page });
  });
  router.get('/output-attempts/:attemptId', async (request, response) => {
    response.json({
      data: attemptResource(
        await attempts.detail(z.uuid().parse(request.params.attemptId), request.principal!),
      ),
    });
  });
  router.post('/output-attempts', async (request, response) => {
    // Resolve a supplied document before checking printer/mode capability or shape.
    const reference = z
      .object({ documentId: z.uuid().optional(), mode: z.string().optional() })
      .parse(request.body);
    if (reference.documentId && reference.mode !== 'TEST_PRINT')
      await documents.detail(reference.documentId, request.principal!);
    const input = OutputAttemptRequestSchema.parse(request.body);
    const key = idempotencyKey(request);
    const row = await runSerializable(database, async (transaction) => {
      if ('documentId' in input)
        await new DocumentRepository(transaction, cursors).detail(
          input.documentId,
          request.principal!,
        );
      if (input.mode === 'TEST_PRINT') {
        const printer = await transaction
          .selectFrom('printer_profile')
          .selectAll()
          .where('id', '=', input.printerProfileId)
          .forUpdate()
          .executeTakeFirst();
        if (!printer) throw new HttpProblem(404, 'RESOURCE_NOT_FOUND', 'Not Found');
        if (!printer.active || printer.archived_at)
          throw new HttpProblem(409, 'PRINTER_UNAVAILABLE', 'Conflict');
      }
      const idempotency = new IdempotencyRepository();
      const acquired = await idempotency.acquire(transaction, {
        actorId: request.principal!.id,
        operationType: 'OUTPUT_ATTEMPT',
        key,
        requestHash: canonicalRequestHash(z.json().parse(input)),
      });
      if (acquired.kind === 'hash_conflict' || acquired.kind === 'in_progress')
        throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Conflict');
      if (acquired.kind === 'replay') return output(OutputAttemptResourceSchema, acquired.body);
      let lastQuery = transaction
        .selectFrom('output_attempt')
        .select('attempt_number')
        .where('actor_id', '=', request.principal!.id);
      lastQuery =
        'printerProfileId' in input
          ? lastQuery.where('printer_profile_id', '=', input.printerProfileId)
          : lastQuery.where('printer_profile_id', 'is', null);
      const last = await lastQuery.orderBy('attempt_number', 'desc').executeTakeFirst();
      const created = await new OutputAttemptRepository(transaction, cursors).append(
        request.principal!,
        {
          ...('documentId' in input ? { documentId: input.documentId } : {}),
          ...('printerProfileId' in input ? { printerProfileId: input.printerProfileId } : {}),
          mode: input.mode,
          state: input.state,
          attemptNumber: (last?.attempt_number ?? 0) + 1,
          requestId: requestId(request),
          ...(input.errorCode
            ? {
                errorCode: /^[A-Z][A-Z0-9_]{0,99}$/.test(input.errorCode)
                  ? input.errorCode
                  : 'OUTPUT_FAILED',
              }
            : {}),
        },
      );
      const resource = attemptResource(created);
      await idempotency.complete(transaction, acquired.id, {
        resourceType: 'OUTPUT_ATTEMPT',
        resourceId: created.id,
        status: 201,
        body: z.json().parse(resource),
      });
      return resource;
    });
    response.status(201).json({ data: row });
  });
  return router;
}

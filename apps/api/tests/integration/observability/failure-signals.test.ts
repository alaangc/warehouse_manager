import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createServer } from '../../../src/server.js';
import { DocumentService } from '../../../src/modules/documents/document-service.js';
import { ScopedCursor } from '../../../src/shared/pagination/scoped-cursor.js';
import {
  documentIntegrationHarness,
  type DocumentIntegrationHarness,
} from '../../support/document-integration-harness.js';
import { createHttpLogger } from '../../../src/http/logger.js';
import { requestContext } from '../../../src/http/request-context.js';
import { HttpProblem, problemHandler } from '../../../src/http/problem-handler.js';
import { operationContext } from '../../../src/observability/operations.js';
import { retryTransactionOperation } from '../../../src/db/serializable-transaction.js';

describe('operational failure signals through HTTP', () => {
  function harness() {
    const lines: string[] = [];
    const app = express();
    app.use(
      requestContext,
      createHttpLogger(
        { LOG_LEVEL: 'info' },
        {
          write: (line: string) => {
            lines.push(line);
          },
        },
      ),
      operationContext,
    );
    return {
      app,
      lines,
      signals: () =>
        lines
          .flatMap((line) => line.trim().split('\n'))
          .map((line) => JSON.parse(line) as Record<string, unknown>)
          .filter((line) => line.event === 'operation_failure'),
    };
  }

  it.each([
    [401, 'INVALID_CREDENTIALS', 'authentication'],
    [401, 'AUTHENTICATION_REQUIRED', 'authentication'],
    [409, 'CASH_CLOSE_PERIOD_ALREADY_CURRENT', 'cash_close'],
    [409, 'CASH_CLOSE_NOT_CURRENT', 'cash_close'],
    [422, 'INVALID_HISTORY_CURSOR', 'history_cursor'],
    [403, 'HISTORY_CURSOR_FORBIDDEN', 'history_cursor'],
  ] as const)('records %s %s without private inputs', async (status, code, operation) => {
    const h = harness();
    h.app.get('/failure', () => {
      throw new HttpProblem(status, code, 'Failure', 'private-detail');
    });
    h.app.use(problemHandler);
    const result = await request(h.app)
      .get('/failure?cursor=private-cursor')
      .set('X-Request-Id', 'signal-request-123')
      .set('Authorization', 'private-token');
    expect(result.status).toBe(status);
    expect(h.signals()).toEqual([
      expect.objectContaining({ operation, code, status, requestId: 'signal-request-123' }),
    ]);
    expect(h.lines.join('')).not.toMatch(/private-detail|private-cursor|private-token/);
  });

  it.each(['40001', '40P01'])(
    'records retries and exhaustion for %s without SQL detail',
    async (code) => {
      const h = harness();
      h.app.get('/transaction', async () => {
        await retryTransactionOperation(
          async () => {
            throw Object.assign(new Error('private SQL/password'), { code });
          },
          { sleep: async () => {}, maxAttempts: 3 },
        );
      });
      h.app.use(problemHandler);
      expect((await request(h.app).get('/transaction')).status).toBe(500);
      expect(h.signals().filter((signal) => signal.operation === 'transaction')).toEqual([
        expect.objectContaining({ code: 'TRANSACTION_RETRY', attempt: 1, sqlState: code }),
        expect.objectContaining({ code: 'TRANSACTION_RETRY', attempt: 2, sqlState: code }),
        expect.objectContaining({ code: 'TRANSACTION_EXHAUSTED', attempt: 3, sqlState: code }),
      ]);
      expect(h.lines.join('')).not.toContain('private SQL/password');
    },
  );

  it('records a nonretryable rollback once and retains the original failure', async () => {
    const h = harness();
    h.app.get('/transaction', async () => {
      await retryTransactionOperation(async () => {
        throw new Error('private failure');
      });
    });
    h.app.use(problemHandler);
    expect((await request(h.app).get('/transaction')).status).toBe(500);
    expect(h.signals().filter((signal) => signal.operation === 'transaction')).toEqual([
      expect.objectContaining({ code: 'TRANSACTION_FAILED', attempt: 1 }),
    ]);
    expect(h.lines.join('')).not.toContain('private failure');
  });

  it('keeps concurrent request correlations separate and successful transactions quiet', async () => {
    const h = harness();
    h.app.get('/failure', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new HttpProblem(401, 'INVALID_CREDENTIALS', 'Authentication Required');
    });
    h.app.get('/success', async (_req, res) => {
      res.json(await retryTransactionOperation(async () => ({ ok: true })));
    });
    h.app.use(problemHandler);
    await Promise.all(
      ['request-one', 'request-two'].map((id) =>
        request(h.app).get('/failure').set('X-Request-Id', id),
      ),
    );
    expect(
      h
        .signals()
        .map((signal) => signal.requestId)
        .sort(),
    ).toEqual(['request-one', 'request-two']);
    expect((await request(h.app).get('/success')).status).toBe(200);
    expect(h.signals()).toHaveLength(2);
  });
});

describe('persisted workflow failure signals', () => {
  let h: DocumentIntegrationHarness;
  let app: ReturnType<typeof createServer>;
  const lines: string[] = [];
  const signals = () =>
    lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.event === 'operation_failure');
  beforeAll(async () => {
    h = await documentIntegrationHarness();
    app = createServer(
      {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://unused/unused',
        SESSION_SECRET: 'x'.repeat(32),
        APP_ORIGIN: 'https://warehouse.test',
        BUSINESS_TIMEZONE: 'America/Hermosillo',
        BUSINESS_CURRENCY: 'MXN',
        PORT: 3000,
        LOG_LEVEL: 'info',
        DOCUMENT_STORAGE_PATH: h.storage,
      },
      {
        database: h.database,
        logDestination: {
          write: (line: string) => {
            lines.push(line);
          },
        },
      },
    );
  });
  afterAll(async () => {
    await h?.close();
  });
  function command(path: string, body: object, key = crypto.randomUUID()) {
    return request(app)
      .post(`/api/v1${path}`)
      .set('Origin', 'https://warehouse.test')
      .set('Cookie', h.admin.cookie)
      .set('X-CSRF-Token', h.admin.csrf)
      .set('Idempotency-Key', key)
      .send(body);
  }

  it('observes authentication and malformed history cursors through production routes', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', 'https://warehouse.test')
          .send({ username: 'admin', password: 'PRIVATE_WRONG_PASSWORD' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/documents?cursor=PRIVATE_BAD_CURSOR')
          .set('Cookie', h.admin.cookie)
      ).status,
    ).toBe(422);
    expect(signals()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
        expect.objectContaining({ code: 'INVALID_HISTORY_CURSOR' }),
      ]),
    );
    expect(lines.join('')).not.toMatch(/PRIVATE_WRONG_PASSWORD|PRIVATE_BAD_CURSOR/);
  });

  it('observes real duplicate and racing cash-close corrections with one surviving successor', async () => {
    const period = { periodKind: 'DAY', anchorDate: '2040-01-04' };
    const initial = await command('/cash-closes', period);
    expect(initial.status).toBe(201);
    expect((await command('/cash-closes', period)).status).toBe(409);
    const id = initial.body.data.id as string;
    const corrections = await Promise.all([
      command(`/cash-closes/${id}/corrections`, { reason: 'First correction' }),
      command(`/cash-closes/${id}/corrections`, { reason: 'Concurrent correction' }),
    ]);
    expect(corrections.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      (await command(`/cash-closes/${id}/corrections`, { reason: 'Stale correction' })).status,
    ).toBe(409);
    expect(
      signals().filter((signal) => signal.code === 'CASH_CLOSE_PERIOD_ALREADY_CURRENT'),
    ).toHaveLength(1);
    expect(signals().filter((signal) => signal.code === 'CASH_CLOSE_NOT_CURRENT')).toHaveLength(2);
    const successors = await h.database
      .selectFrom('cash_close')
      .select('id')
      .where('supersedes_cash_close_id', '=', id)
      .execute();
    expect(successors).toHaveLength(1);
  });

  it('records committed printer failure and uncertainty without copying client error text', async () => {
    const doc = await h.ready(h.ticket);
    const before = await h.businessState();
    for (const state of ['FAILED', 'UNKNOWN']) {
      const response = await command('/output-attempts', {
        documentId: doc.id,
        printerProfileId: h.printerProfileId,
        mode: 'PRINT',
        state,
        errorCode: 'PRIVATE_CLIENT_SECRET',
      });
      expect(response.status).toBe(201);
    }
    expect(signals()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PRINTER_ATTEMPT_FAILED' }),
        expect.objectContaining({ code: 'PRINTER_ATTEMPT_UNKNOWN' }),
      ]),
    );
    expect(lines.join('')).not.toContain('PRIVATE_CLIENT_SECRET');
    expect(await h.businessState()).toEqual(before);
  });

  it('logs generation failure after its record commits, with unchanged business state', async () => {
    const source = await h.newSale();
    const before = await h.businessState();
    const local = express();
    local.use(
      requestContext,
      createHttpLogger(
        { LOG_LEVEL: 'info' },
        {
          write: (line: string) => {
            lines.push(line);
          },
        },
      ),
      operationContext,
    );
    local.post('/generate', async (_req, res) => {
      const service = new DocumentService(h.database, new ScopedCursor('x'.repeat(32)), h.storage, {
        render: async () => {
          throw new Error('PRIVATE_RENDER_SECRET');
        },
      });
      res
        .status(202)
        .json(
          await service.request(
            { id: h.admin.id, role: 'ADMINISTRATOR' },
            source,
            crypto.randomUUID(),
          ),
        );
    });
    local.use(problemHandler);
    const response = await request(local).post('/generate');
    expect(response.status).toBe(202);
    expect(response.body.state).toBe('FAILED');
    expect(signals()).toContainEqual(
      expect.objectContaining({ code: 'DOCUMENT_GENERATION_FAILED' }),
    );
    expect(lines.join('')).not.toContain('PRIVATE_RENDER_SECRET');
    const persisted = await h.database
      .selectFrom('document_output')
      .select('state')
      .where('id', '=', response.body.id as string)
      .executeTakeFirstOrThrow();
    expect(persisted.state).toBe('FAILED');
    expect(await h.businessState()).toEqual(before);
  });

  it('rolls back real PostgreSQL writes after serialization exhaustion', async () => {
    const local = express();
    local.use(
      requestContext,
      createHttpLogger(
        { LOG_LEVEL: 'info' },
        {
          write: (line: string) => {
            lines.push(line);
          },
        },
      ),
      operationContext,
    );
    await sql`create table signal_rollback (id integer)`.execute(h.database);
    local.post('/rollback', async () => {
      await retryTransactionOperation(
        () =>
          h.database.transaction().execute(async (transaction) => {
            await sql`insert into signal_rollback values (1)`.execute(transaction);
            await sql`do $$ begin raise exception 'PRIVATE_SQL_SECRET' using errcode = '40001'; end $$`.execute(
              transaction,
            );
          }),
        { sleep: async () => {} },
      );
    });
    local.use(problemHandler);
    expect((await request(local).post('/rollback')).status).toBe(500);
    expect((await sql`select * from signal_rollback`.execute(h.database)).rows).toHaveLength(0);
    expect(signals()).toContainEqual(
      expect.objectContaining({ code: 'TRANSACTION_EXHAUSTED', sqlState: '40001' }),
    );
    expect(lines.join('')).not.toContain('PRIVATE_SQL_SECRET');
  });
});

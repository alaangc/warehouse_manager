import pino, { type DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';
import { HTTP_LOG_REDACTION } from '../../../src/http/logger.js';
import { createHttpLogger } from '../../../src/http/logger.js';
import express from 'express';
import supertest from 'supertest';
import { problemHandler } from '../../../src/http/problem-handler.js';

describe('HTTP logger redaction', () => {
  it('omits credentials, query strings, bodies and exception contents from actual HTTP logs', async () => {
    const lines: string[] = [];
    const app = express();
    app.use(
      createHttpLogger(
        { LOG_LEVEL: 'info' },
        {
          write: (line) => {
            lines.push(line);
          },
        },
      ),
    );
    app.use(express.json());
    app.post('/failure', (_req, res, next) => {
      res.set('Set-Cookie', 'session=response-secret');
      next(new Error('postgres://user:database-secret@localhost/db'));
    });
    app.use(problemHandler);
    await supertest(app)
      .post('/failure?password=query-secret')
      .set('Authorization', 'Bearer auth-secret')
      .set('Cookie', 'session=cookie-secret')
      .set('X-CSRF-Token', 'csrf-secret')
      .send({ password: 'body-secret' });
    const output = lines.join('');
    for (const secret of [
      'query-secret',
      'auth-secret',
      'cookie-secret',
      'csrf-secret',
      'body-secret',
      'response-secret',
      'database-secret',
    ])
      expect(output).not.toContain(secret);
    expect(output).toContain('/failure');
    expect(output).toContain('500');
  });
  it('redacts authentication secrets from request and response headers', () => {
    const lines: string[] = [];
    const destination: DestinationStream = {
      write(message) {
        lines.push(message);
      },
    };
    const logger = pino({ redact: HTTP_LOG_REDACTION }, destination);

    logger.info({
      req: {
        headers: {
          authorization: 'Bearer secret',
          cookie: '__Host-wm_session=secret',
          'x-csrf-token': 'request-csrf',
        },
      },
      res: {
        headers: {
          'set-cookie': '__Host-wm_session=response-secret',
          'x-csrf-token': 'response-csrf',
        },
      },
    });

    const logged = JSON.parse(lines.at(-1) ?? '{}') as {
      req: { headers: Record<string, string> };
      res: { headers: Record<string, string> };
    };
    expect(logged.req.headers).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'x-csrf-token': '[REDACTED]',
    });
    expect(logged.res.headers).toEqual({
      'set-cookie': '[REDACTED]',
      'x-csrf-token': '[REDACTED]',
    });
  });
});

import pino, { type DestinationStream } from 'pino';
import { describe, expect, it } from 'vitest';
import { HTTP_LOG_REDACTION } from '../../../src/http/logger.js';

describe('HTTP logger redaction', () => {
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

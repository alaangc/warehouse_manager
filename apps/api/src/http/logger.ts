import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { Environment } from '../config/env.js';

export function createHttpLogger(environment: Pick<Environment, 'LOG_LEVEL'>) {
  const logger = pino({
    level: environment.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-csrf-token',
        'password',
        '*.password',
        '*.passwordHash',
        '*.sessionToken',
      ],
      censor: '[REDACTED]',
    },
  });
  return pinoHttp({
    logger,
    customProps: (request) => ({ requestId: request.id }),
  });
}

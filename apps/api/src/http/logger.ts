import pino, { type DestinationStream, type LoggerOptions } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Environment } from '../config/env.js';

export const HTTP_LOG_REDACTION: NonNullable<LoggerOptions['redact']> = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers.x-csrf-token',
    'res.headers.set-cookie',
    'res.headers.x-csrf-token',
    'password',
    '*.password',
    '*.passwordHash',
    '*.sessionToken',
  ],
  censor: '[REDACTED]',
};

const loggerOptions = (environment: Pick<Environment, 'LOG_LEVEL'>): LoggerOptions => ({
  level: environment.LOG_LEVEL,
  redact: HTTP_LOG_REDACTION,
});

export function createHttpLogger(
  environment: Pick<Environment, 'LOG_LEVEL'>,
  destination?: DestinationStream,
) {
  const logger = destination
    ? pino(loggerOptions(environment), destination)
    : pino(loggerOptions(environment));
  return pinoHttp({
    logger,
    // Allowlist metadata: raw URLs, bodies, headers and exception messages may
    // contain credentials or customer data, including database error details.
    serializers: {
      req: (request: { id?: unknown; method?: string; url?: string }) => ({
        id: request.id,
        method: request.method,
        path: request.url?.split('?')[0],
      }),
      res: (response: { statusCode?: number }) => ({ statusCode: response.statusCode }),
      err: () => ({ type: 'RequestError' }),
    },
    customProps: (request) => ({ requestId: request.id }),
  });
}

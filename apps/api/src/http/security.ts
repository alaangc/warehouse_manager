import type { Express, RequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Environment } from '../config/env.js';
import { HttpProblem } from './problem-handler.js';

export function requestLimiter(limit: number, windowMs = 60_000): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (request) => ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? ''),
    handler: (_request, _response, next) =>
      next(new HttpProblem(429, 'RATE_LIMIT_EXCEEDED', 'Too Many Requests')),
  });
}

export function configureSecurity(app: Express, environment: Environment): void {
  const production = environment.NODE_ENV === 'production';
  app.disable('x-powered-by');
  app.set('trust proxy', environment.TRUST_PROXY?.split(',').map((entry) => entry.trim()) ?? false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      strictTransportSecurity: production ? { maxAge: 31_536_000 } : false,
      referrerPolicy: { policy: 'no-referrer' },
      xFrameOptions: { action: 'deny' },
    }),
  );
  app.use((request, response, next) => {
    response.set(
      'Permissions-Policy',
      'bluetooth=(self), camera=(), microphone=(), geolocation=()',
    );
    response.set('Cache-Control', 'private, no-store');
    // Internal readiness probes carry no session or business data.
    if (
      production &&
      !request.secure &&
      !(request.method === 'GET' && request.path === '/api/v1/health')
    )
      return next(new HttpProblem(400, 'HTTPS_REQUIRED', 'Bad Request', 'HTTPS is required.'));
    next();
  });
  const apiLimiter = requestLimiter(600);
  app.use('/api/v1', (request, response, next) => {
    if (request.method === 'GET' && request.path === '/health') return next();
    return apiLimiter(request, response, next);
  });
  // Bound password hashing work even when an attacker rotates usernames.
  app.post('/api/v1/auth/login', requestLimiter(30));
}

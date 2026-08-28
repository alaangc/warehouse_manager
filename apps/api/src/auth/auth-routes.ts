import { createHash } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
import { HttpProblem } from '../http/problem-handler.js';
import type { AuthenticationGateway } from './auth-service.js';
import { SESSION_COOKIE, sessionCookieOptions } from './session-store.js';

const Login = z
  .object({ username: z.string().trim().min(1).max(120), password: z.string().min(8).max(1024) })
  .strict();
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function parseCookie(value: string | undefined, name: string): string | undefined {
  return value
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function originProtection(origin: string): RequestHandler {
  return (request, _response, next) => {
    if (!unsafeMethods.has(request.method)) return next();
    const supplied = request.header('Origin');
    if (!supplied || supplied !== origin)
      return next(
        new HttpProblem(403, 'ORIGIN_FORBIDDEN', 'Forbidden', 'The request origin is not allowed.'),
      );
    next();
  };
}

export function sessionMiddleware(auth: AuthenticationGateway): RequestHandler {
  return async (request, _response, next) => {
    try {
      const id = parseCookie(request.header('Cookie'), SESSION_COOKIE);
      if (!id) return next();
      const session = await auth.findSession(id);
      if (session) {
        request.principal = session.principal;
        request.sessionId = id;
        request.csrfToken = session.csrfHash;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function csrfProtection(auth: AuthenticationGateway): RequestHandler {
  return (request, _response, next) => {
    if (!unsafeMethods.has(request.method) || request.path === '/auth/login') return next();
    if (!request.principal)
      return next(new HttpProblem(401, 'AUTHENTICATION_REQUIRED', 'Authentication Required'));
    const token = request.header('X-CSRF-Token');
    if (!token || !request.csrfToken || !auth.matchesCsrf(request.csrfToken, token)) {
      return next(
        new HttpProblem(403, 'CSRF_INVALID', 'Forbidden', 'The CSRF token is missing or invalid.'),
      );
    }
    next();
  };
}

export function createAuthRouter(auth: AuthenticationGateway, environment: Environment): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (request) => {
      const body: unknown = request.body;
      const username =
        typeof body === 'object' &&
        body !== null &&
        'username' in body &&
        typeof body.username === 'string'
          ? body.username
          : '';
      return createHash('sha256')
        .update(`${ipKeyGenerator(request.ip ?? '')}:${username}`)
        .digest('hex');
    },
  });
  router.post('/auth/login', limiter, async (request, response, next) => {
    try {
      const input = Login.parse(request.body);
      const session = await auth.login(input.username, input.password);
      response.cookie(SESSION_COOKIE, session.id, {
        ...sessionCookieOptions,
        secure: environment.NODE_ENV !== 'test',
      });
      response.set('X-CSRF-Token', session.csrfToken).json({ data: session.principal });
    } catch (error) {
      next(error);
    }
  });
  router.get('/auth/session', (request, response, next) => {
    if (!request.principal)
      return next(new HttpProblem(401, 'AUTHENTICATION_REQUIRED', 'Authentication Required'));
    response.json({ data: request.principal });
  });
  router.post('/auth/logout', async (request, response, next) => {
    try {
      if (!request.sessionId)
        throw new HttpProblem(401, 'AUTHENTICATION_REQUIRED', 'Authentication Required');
      await auth.logout(request.sessionId);
      response
        .clearCookie(SESSION_COOKIE, {
          path: '/',
          secure: environment.NODE_ENV !== 'test',
          sameSite: 'strict',
          httpOnly: true,
        })
        .status(204)
        .send();
    } catch (error) {
      next(error);
    }
  });
  return router;
}

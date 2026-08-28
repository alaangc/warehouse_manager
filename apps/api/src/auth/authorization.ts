import type { RequestHandler } from 'express';
import { HttpProblem } from '../http/problem-handler.js';

export const requireAuthenticated: RequestHandler = (request, _response, next) => {
  if (!request.principal)
    return next(new HttpProblem(401, 'AUTHENTICATION_REQUIRED', 'Authentication Required'));
  next();
};

export function requireRole(...roles: Array<'ADMINISTRATOR' | 'DRIVER'>): RequestHandler {
  return (request, _response, next) => {
    if (!request.principal)
      return next(new HttpProblem(401, 'AUTHENTICATION_REQUIRED', 'Authentication Required'));
    if (!roles.includes(request.principal.role))
      return next(
        new HttpProblem(
          403,
          'ROLE_FORBIDDEN',
          'Forbidden',
          'Your role cannot perform this operation.',
        ),
      );
    next();
  };
}

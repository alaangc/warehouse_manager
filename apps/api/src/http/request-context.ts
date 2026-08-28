import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const validRequestId = /^[A-Za-z0-9._-]{8,128}$/;

export const requestContext: RequestHandler = (request, response, next) => {
  const supplied = request.header('X-Request-Id');
  request.id = supplied && validRequestId.test(supplied) ? supplied : randomUUID();
  response.set('X-Request-Id', request.id);
  next();
};

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export type ProblemExtension =
  string | number | boolean | null | string[] | Record<string, string[]>;

export class HttpProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    public readonly detail?: string,
    public readonly extensions: Record<string, ProblemExtension> = {},
  ) {
    super(title);
  }
}

const titles: Record<number, string> = {
  400: 'Bad Request',
  401: 'Authentication Required',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Validation Failed',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new HttpProblem(
      404,
      'RESOURCE_NOT_FOUND',
      titles[404]!,
      `No route matches ${request.method} ${request.path}`,
    ),
  );
};

export const problemHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  void _next;
  const requestId =
    typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : 'unknown';
  let problem: HttpProblem;
  if (error instanceof HttpProblem) {
    problem = error;
  } else if (error instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const field = issue.path.join('.') || 'body';
      (errors[field] ??= []).push(issue.message);
    }
    problem = new HttpProblem(
      422,
      'VALIDATION_FAILED',
      titles[422]!,
      'The request contains invalid values.',
      { errors },
    );
  } else if (error instanceof SyntaxError && 'body' in error) {
    problem = new HttpProblem(
      400,
      'INVALID_JSON',
      titles[400]!,
      'The request body is not valid JSON.',
    );
  } else {
    request.log?.error({ err: error }, 'Unhandled request error');
    problem = new HttpProblem(
      500,
      'INTERNAL_ERROR',
      titles[500]!,
      'The server could not complete the request.',
    );
  }
  response
    .status(problem.status)
    .type('application/problem+json')
    .set('X-Request-Id', requestId)
    .json({
      type: `https://warehouse-manager.local/problems/${problem.code.toLowerCase().replaceAll('_', '-')}`,
      title: problem.title,
      status: problem.status,
      code: problem.code,
      detail: problem.detail,
      instance: request.originalUrl,
      requestId,
      ...problem.extensions,
    });
};

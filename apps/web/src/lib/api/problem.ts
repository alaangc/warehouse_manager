import type { ProblemDetails } from '@warehouse/contracts';

export class ApiProblem extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiProblem';
  }
  get status() {
    return this.problem.status;
  }
  get code() {
    return this.problem.code;
  }
  get isAuthenticationFailure() {
    return this.status === 401;
  }
  get isAuthorizationFailure() {
    return this.status === 403;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isValidationFailure() {
    return this.status === 422;
  }
}

export async function decodeProblem(response: Response): Promise<ApiProblem> {
  let body: Partial<ProblemDetails> = {};
  try {
    body = (await response.json()) as Partial<ProblemDetails>;
  } catch {
    /* safe fallback */
  }
  return new ApiProblem({
    type: body.type ?? 'about:blank',
    title: body.title ?? (response.statusText || 'Request failed'),
    status: body.status ?? response.status,
    code: body.code ?? 'HTTP_ERROR',
    ...(body.detail === undefined ? {} : { detail: body.detail }),
    ...(body.instance === undefined ? {} : { instance: body.instance }),
    ...(body.requestId === undefined ? {} : { requestId: body.requestId }),
    ...(body.errors === undefined ? {} : { errors: body.errors }),
  });
}

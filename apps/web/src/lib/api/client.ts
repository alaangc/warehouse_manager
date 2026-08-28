import { decodeProblem } from './problem.js';

let csrfToken: string | undefined;
export function setCsrfToken(value: string | null): void {
  csrfToken = value ?? undefined;
}

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? 15_000);
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json, application/problem+json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(options.method ?? 'GET'))
    headers.set('X-CSRF-Token', csrfToken);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  try {
    const {
      body,
      timeoutMs: _timeoutMs,
      idempotencyKey: _idempotencyKey,
      ...requestOptions
    } = options;
    void _timeoutMs;
    void _idempotencyKey;
    const requestInit: RequestInit = {
      ...requestOptions,
      credentials: 'include',
      headers,
      signal: options.signal ?? controller.signal,
    };
    if (body !== undefined) requestInit.body = JSON.stringify(body);
    const response = await fetch(`/api/v1${path}`, requestInit);
    const receivedCsrf = response.headers.get('X-CSRF-Token');
    if (receivedCsrf) setCsrfToken(receivedCsrf);
    if (!response.ok) throw await decodeProblem(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

import { DocumentResourceSchema, type DocumentCreateRequest } from '@warehouse/contracts';
import type { TFunction } from 'i18next';
import { apiRequest } from '../../lib/api/client.js';
import { ApiProblem, decodeProblem } from '../../lib/api/problem.js';

export function documentError(error: unknown, t: TFunction): string {
  if (error instanceof ApiProblem) {
    if (error.status === 401 || error.status === 403) return t('documents.forbidden');
    if (error.status === 409) return t('documents.conflict');
    if (error.code === 'CURSOR_INVALID' || error.code === 'INVALID_CURSOR')
      return t('documents.cursor');
    if (error.status === 422) return t('documents.invalid');
  }
  return t('documents.error');
}
export async function readDocument(id: string, signal: AbortSignal) {
  const response = await apiRequest<{ data: unknown }>(`/documents/${encodeURIComponent(id)}`, {
    signal,
  });
  return DocumentResourceSchema.parse(response.data);
}
export async function requestDocument(source: DocumentCreateRequest, idempotencyKey: string) {
  const response = await apiRequest<{ data: unknown }>('/documents', {
    method: 'POST',
    body: source,
    idempotencyKey,
  });
  return DocumentResourceSchema.parse(response.data);
}
export async function fetchDocumentFile(id: string, signal: AbortSignal): Promise<File> {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  const response = await fetch(`/api/v1/documents/${encodeURIComponent(id)}/content`, {
    credentials: 'include',
    headers: { Accept: 'application/pdf, application/problem+json' },
    signal: combined,
    cache: 'no-store',
  });
  if (!response.ok) throw await decodeProblem(response);
  if (response.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'application/pdf')
    throw new Error('DOCUMENT_CONTENT_INVALID');
  const bytes = await response.arrayBuffer();
  combined.throwIfAborted();
  if (!bytes.byteLength || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
    throw new Error('DOCUMENT_CONTENT_INVALID');
  const filename =
    /filename="([a-zA-Z0-9._-]+\.pdf)"/i.exec(
      response.headers.get('Content-Disposition') ?? '',
    )?.[1] ?? `document-${id}.pdf`;
  return new File([bytes], filename, { type: 'application/pdf' });
}
export function saveDocumentFile(file: File): void {
  const url = URL.createObjectURL(file);
  const revoke = URL.revokeObjectURL.bind(URL);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => revoke(url), 1_000);
  }
}

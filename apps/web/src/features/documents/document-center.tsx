import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DocumentCreateSchema,
  type DocumentCreateRequest,
  type SessionUser,
} from '@warehouse/contracts';
import { FilePlus2, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { ApiProblem } from '../../lib/api/problem.js';
import { documentError, readDocument, requestDocument } from './document-api.js';
import { DocumentActions } from './document-actions.js';
import { canOfferPrint, PrintDialog } from '../printers/print-dialog.js';

export type DocumentSource = DocumentCreateRequest & { sourceState: string; driverId?: string };
function allowed(source: DocumentSource, user: SessionUser): boolean {
  if (
    !DocumentCreateSchema.safeParse({
      documentType: source.documentType,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    }).success
  )
    return false;
  if (source.documentType === 'ROUTE_LOAD' && source.sourceState !== 'CONFIRMED') return false;
  if (source.documentType === 'TICKET' && !['COMPLETED', 'CANCELLED'].includes(source.sourceState))
    return false;
  if (source.documentType === 'CASH_CLOSE' && source.sourceState !== 'CLOSED') return false;
  if (source.documentType === 'REPORT' && source.sourceState !== 'READY') return false;
  return (
    user.role === 'ADMINISTRATOR' ||
    (['TICKET', 'ROUTE_LOAD'].includes(source.documentType) && source.driverId === user.id)
  );
}
export function DocumentCenter({
  source,
  documentId,
}: {
  source?: DocumentSource;
  documentId?: string;
}) {
  const { user } = useSession();
  const { t } = useTranslation();
  if (!user?.active || (source && !allowed(source, user)) || (!source && !documentId))
    return <Alert severity="error">{t('documents.forbidden')}</Alert>;
  return (
    <Output
      key={`${user.id}:${user.role}:${source?.sourceId ?? documentId}:${source?.documentType ?? ''}:${source?.sourceState ?? ''}`}
      actorId={`${user.id}:${user.role}`}
      source={source}
      documentId={documentId}
    />
  );
}
function Output({
  actorId,
  source,
  documentId,
}: {
  actorId: string;
  source: DocumentSource | undefined;
  documentId: string | undefined;
}) {
  const { t } = useTranslation();
  const { user } = useSession();
  const [printing, setPrinting] = useState(false);
  const client = useQueryClient();
  const [id, setId] = useState(documentId);
  const [outputError, setOutputError] = useState<unknown>(null);
  const requestKey = useRef<string | null>(null);
  const status = useQuery({
    queryKey: ['document-output', actorId, id],
    queryFn: ({ signal }) => readDocument(id!, signal),
    enabled: Boolean(id),
    retry: false,
    staleTime: 5_000,
    refetchInterval: (query) =>
      !query.state.error && query.state.data?.state === 'PENDING' ? 500 : false,
    refetchOnWindowFocus: false,
  });
  const generate = useMutation({
    mutationFn: (input: DocumentCreateRequest) => {
      requestKey.current ??= crypto.randomUUID();
      return requestDocument(input, requestKey.current);
    },
    retry: false,
    onSuccess: (document) => {
      client.setQueryData(['document-output', actorId, document.id], document);
      setId(document.id);
      void client.invalidateQueries({ queryKey: ['document-history'] });
    },
  });
  const error = generate.error ?? status.error ?? outputError;
  const denied = error instanceof ApiProblem && [401, 403].includes(error.status);
  const document = status.isError || generate.isError || denied ? undefined : status.data;
  const busy = generate.isPending;
  const createInput = source ?? status.data;
  const canGenerate = !denied && createInput && (!document || document.state === 'FAILED');
  return (
    <Stack spacing={2} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="h6" component="h2">
        {t('documents.title')}
      </Typography>
      {Boolean(error) && <Alert severity="error">{documentError(error, t)}</Alert>}
      {generate.isPending && <CircularProgress size={24} aria-label={t('documents.generating')} />}
      {id && status.isLoading && <CircularProgress size={24} aria-label={t('documents.loading')} />}
      {document && (
        <>
          <Typography>
            {t(`documents.${document.documentType}`)} / {document.id}
          </Typography>
          <Typography>
            {t('documents.state')}: {t(`documents.${document.state}`)}
          </Typography>
          <Typography variant="body2">
            {t('documents.contentVersion')}: {document.contentVersion}
          </Typography>
          <Typography variant="body2">
            {t('documents.sourceType')}: {t(`documents.${document.sourceType}`)}
          </Typography>
          <Typography variant="body2">
            {t('documents.sourceId')}: {document.sourceId}
          </Typography>
          <Typography variant="body2">
            {t('documents.createdBy')}: {document.createdBy}
          </Typography>
          <Typography variant="body2">
            {t('documents.createdAt')}: {document.createdAt}
          </Typography>
          {document.state === 'PENDING' && <Alert severity="info">{t('documents.pending')}</Alert>}
          {document.state === 'FAILED' && <Alert severity="error">{t('documents.failed')}</Alert>}
        </>
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {canGenerate && (
          <Button
            variant="contained"
            startIcon={
              document?.state === 'FAILED' || generate.isError ? (
                <RefreshCw size={18} />
              ) : (
                <FilePlus2 size={18} />
              )
            }
            disabled={busy}
            onClick={() => {
              setOutputError(null);
              const input = DocumentCreateSchema.parse({
                documentType: createInput.documentType,
                sourceType: createInput.sourceType,
                sourceId: createInput.sourceId,
              });
              generate.mutate(input);
            }}
          >
            {t(
              document?.state === 'FAILED' || generate.isError
                ? 'documents.retry'
                : 'documents.generate',
            )}
          </Button>
        )}
        {!denied && id && (
          <Button
            startIcon={<RefreshCw size={18} />}
            disabled={busy || status.isFetching}
            onClick={() => {
              generate.reset();
              setOutputError(null);
              void status.refetch();
            }}
          >
            {t('documents.refresh')}
          </Button>
        )}
      </Stack>
      {!denied && document && (
        <>
          <DocumentActions
            document={document}
            disabled={busy || status.isFetching}
            onDenied={setOutputError}
          />
          {user && canOfferPrint(document, user, source) && (
            <>
              <Button disabled={busy || status.isFetching} onClick={() => setPrinting(true)}>
                {t('printers.print')}
              </Button>
              <PrintDialog
                open={printing}
                document={document}
                {...(source ? { source } : {})}
                onClose={() => setPrinting(false)}
              />
            </>
          )}
        </>
      )}
    </Stack>
  );
}

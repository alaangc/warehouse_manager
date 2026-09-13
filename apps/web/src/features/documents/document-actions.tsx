import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import type { DocumentResource } from '@warehouse/contracts';
import { Download, RefreshCw, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { ApiProblem } from '../../lib/api/problem.js';
import { documentError, fetchDocumentFile, saveDocumentFile } from './document-api.js';

function canShare(file: File): boolean {
  try {
    return (
      window.isSecureContext !== false &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}
type Props = {
  document: DocumentResource;
  disabled?: boolean;
  onDenied?: (error: unknown) => void;
};
export function DocumentActions(props: Props) {
  const { user } = useSession();
  if (
    !user?.active ||
    (user.role === 'DRIVER' && !['TICKET', 'ROUTE_LOAD'].includes(props.document.documentType))
  )
    return null;
  return (
    <FileActions
      key={`${user.id}:${user.role}:${props.document.id}:${props.document.contentVersion}:${props.document.state}`}
      {...props}
    />
  );
}
function FileActions({ document, disabled = false, onDenied }: Props) {
  const { t } = useTranslation();
  const ready = document.state === 'READY';
  const [shareSupported] = useState(
    () => ready && canShare(new File([], 'document.pdf', { type: 'application/pdf' })),
  );
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(shareSupported);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const mounted = useRef(true);
  const downloadController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      downloadController.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!shareSupported) return;
    const controller = new AbortController();
    let current = true;
    void fetchDocumentFile(document.id, controller.signal)
      .then((prepared) => {
        if (current) setFile(prepared);
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setError(cause);
        if (cause instanceof ApiProblem && [401, 403].includes(cause.status)) onDenied?.(cause);
      })
      .finally(() => {
        if (current) setPreparing(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [document.id, shareSupported, revision, onDenied]);

  const denied = error instanceof ApiProblem && [401, 403].includes(error.status);
  const blocked = disabled || !ready || busy || denied;
  async function download() {
    if (blocked || active.current) return;
    active.current = true;
    setBusy(true);
    setMessage('');
    setError(null);
    const controller = new AbortController();
    downloadController.current = controller;
    try {
      // Reauthorize the canonical content instead of downloading a previously cached file.
      const result = await fetchDocumentFile(document.id, controller.signal);
      if (!mounted.current) return;
      saveDocumentFile(result);
      setMessage('documents.downloaded');
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause);
      if (cause instanceof ApiProblem && [401, 403].includes(cause.status)) onDenied?.(cause);
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function share() {
    if (blocked || active.current || !file) return;
    if (!canShare(file)) {
      setMessage('documents.shareUnavailable');
      setFile(null);
      return;
    }
    active.current = true;
    setBusy(true);
    setMessage('');
    setError(null);
    try {
      // No await, fetch, or mutation before this call: retain the click's transient activation.
      await navigator.share({ files: [file] });
      if (mounted.current) setMessage('documents.shared');
    } catch (cause) {
      if (mounted.current)
        setMessage(
          (cause instanceof Error || cause instanceof DOMException) && cause.name === 'AbortError'
            ? 'documents.shareCancelled'
            : 'documents.shareUnavailable',
        );
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Stack spacing={1}>
      {Boolean(error) && <Alert severity="error">{documentError(error, t)}</Alert>}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', minHeight: 36 }}>
        {!denied && (
          <Button
            startIcon={<Download size={18} />}
            disabled={blocked}
            onClick={() => void download()}
          >
            {t('documents.download')}
          </Button>
        )}
        {!denied && file && canShare(file) && (
          <Button startIcon={<Share2 size={18} />} disabled={blocked} onClick={() => void share()}>
            {t('documents.share')}
          </Button>
        )}
        {preparing && <CircularProgress size={24} aria-label={t('documents.preparingShare')} />}
        {!denied && shareSupported && !preparing && !file && Boolean(error) && (
          <Button
            startIcon={<RefreshCw size={18} />}
            disabled={blocked}
            onClick={() => {
              setError(null);
              setPreparing(true);
              setRevision((value) => value + 1);
            }}
          >
            {t('documents.retry')}
          </Button>
        )}
      </Stack>
      {message && <Typography role="status">{t(message)}</Typography>}
    </Stack>
  );
}

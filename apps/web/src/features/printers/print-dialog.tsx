import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  NativeSelect,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  OutputAttemptResourceSchema,
  PrinterProfileResourceSchema,
  ThermalDocumentSchema,
  type DocumentResource,
  type SessionUser,
} from '@warehouse/contracts';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { documentError } from '../documents/document-api.js';
import { DocumentActions } from '../documents/document-actions.js';
import type { DocumentSource } from '../documents/document-center.js';
import { formatEscPos } from './escpos-formatter.js';
import {
  parsePrintableDocument,
  PrinterError,
  type PrinterAdapter,
  type TestResult,
} from './printer-adapter.js';
import { WebBluetoothPrinterAdapter } from './web-bluetooth-adapter.js';

type Props = {
  open: boolean;
  document: DocumentResource;
  source?: DocumentSource;
  adapter?: PrinterAdapter;
  onClose: () => void;
};
// Visibility is a convenience only: the print-data and STARTED APIs reauthorize the source.
export function canOfferPrint(
  document: DocumentResource,
  user: SessionUser,
  source?: DocumentSource,
) {
  if (!user.active || document.state !== 'READY' || document.documentType === 'REPORT')
    return false;
  if (user.role === 'DRIVER' && !['TICKET', 'ROUTE_LOAD'].includes(document.documentType))
    return false;
  if (source) {
    if (
      source.sourceId !== document.sourceId ||
      source.documentType !== document.documentType ||
      source.sourceType !== document.sourceType
    )
      return false;
    if (user.role === 'DRIVER' && source.driverId !== user.id) return false;
    try {
      parsePrintableDocument({ ...document, sourceState: source.sourceState });
    } catch {
      return false;
    }
  }
  return true;
}
export function PrintDialog(props: Props) {
  const { user } = useSession();
  if (!props.open || !user || !canOfferPrint(props.document, user, props.source)) return null;
  return (
    <PrintPanel
      key={`${user.id}:${user.role}:${props.document.id}:${props.document.contentVersion}`}
      {...props}
      actorId={user.id}
    />
  );
}
type PendingResult = { body: Record<string, unknown>; key: string; outcome: TestResult };
function PrintPanel({
  document,
  adapter: injected,
  onClose,
  actorId,
}: Props & { actorId: string }) {
  const { t } = useTranslation();
  const [adapter] = useState(() => injected ?? new WebBluetoothPrinterAdapter());
  const connection = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const capability = adapter.capability();
  const [selection, setSelection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const data = useQuery({
    queryKey: ['print-data', actorId, document.id, document.contentVersion],
    queryFn: async ({ signal }) => {
      const response = await apiRequest<{ data: unknown }>(`/documents/${document.id}/print-data`, {
        signal,
        cache: 'no-store',
      });
      const parsed = ThermalDocumentSchema.parse(response.data);
      parsePrintableDocument(parsed);
      if (
        parsed.id !== document.id ||
        parsed.contentVersion !== document.contentVersion ||
        parsed.sourceId !== document.sourceId ||
        parsed.documentType !== document.documentType
      )
        throw new Error('DOCUMENT_MISMATCH');
      return parsed;
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const profiles = useQuery({
    queryKey: ['print-profiles', actorId],
    queryFn: async () => {
      const response = await apiRequest<{ data: unknown }>('/printer-profiles');
      return PrinterProfileResourceSchema.array()
        .parse(response.data)
        .filter((profile) => profile.active);
    },
    retry: false,
  });
  const preference = useQuery({
    queryKey: ['print-preference', actorId],
    queryFn: () =>
      apiRequest<{ data: { printerProfileId: string | null } }>('/me/printer-preference'),
    retry: false,
  });
  // Read existing attempts, including unresolved STARTED, so reopening never silently retries.
  const history = useQuery({
    queryKey: ['print-history', actorId, document.id],
    queryFn: async () => {
      const responses = await Promise.all(
        ['PRINT', 'REPRINT'].map((mode) =>
          apiRequest<{ data: unknown }>(
            `/output-attempts?documentId=${document.id}&mode=${mode}&limit=1`,
          ),
        ),
      );
      return responses.some(
        (response) => OutputAttemptResourceSchema.array().parse(response.data).length > 0,
      );
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const profile = profiles.data?.find(
    (row) => row.id === (selection ?? preference.data?.data?.printerProfileId),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      adapter.disconnect();
    };
  }, [adapter]);
  useEffect(() => {
    adapter.disconnect();
  }, [adapter, profile?.id, profile?.version]);
  const failure = error ?? data.error ?? profiles.error ?? preference.error ?? history.error;
  const ready = Boolean(
    data.data &&
    profile &&
    !data.isFetching &&
    !history.isFetching &&
    history.isSuccess &&
    preference.isSuccess &&
    profiles.isSuccess &&
    !failure,
  );
  const reprint = attempted || history.data === true;
  async function accepted(body: Record<string, unknown>, key: string) {
    const response = await apiRequest<{ data: unknown }>('/output-attempts', {
      method: 'POST',
      body,
      idempotencyKey: key,
    });
    const row = OutputAttemptResourceSchema.parse(response.data);
    if (
      row.actorId !== actorId ||
      row.mode !== body.mode ||
      row.state !== body.state ||
      row.printerProfileId !== body.printerProfileId ||
      (body.documentId && row.documentId !== body.documentId)
    )
      throw new Error('ATTEMPT_MISMATCH');
  }
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      if (mounted.current) setError(failure);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function saveResult(value: PendingResult) {
    await accepted(value.body, value.key);
    if (mounted.current) {
      setResult(value.outcome);
      setPending(null);
    }
  }
  async function send(test = false) {
    if (!ready || !profile || !data.data || connection.state !== 'CONNECTED' || pending) return;
    const mode = test ? 'TEST_PRINT' : reprint ? 'REPRINT' : 'PRINT';
    const metadata = data.data;
    // Formatting fails before an attempt or device write; all amounts come from persisted snapshots.
    const bytes = test
      ? undefined
      : formatEscPos(metadata, { profile, mode: mode as 'PRINT' | 'REPRINT', confirmed: confirm });
    const reference = {
      mode,
      printerProfileId: profile.id,
      ...(!test ? { documentId: document.id } : {}),
    };
    setResult(null);
    // Even a lost STARTED response requires an explicit next attempt, never an automatic retry.
    if (!test) setAttempted(true);
    await accepted({ ...reference, state: 'STARTED' }, crypto.randomUUID());
    if (!mounted.current) return;
    let outcome: TestResult;
    try {
      outcome = test
        ? await adapter.test()
        : await adapter.print(metadata, {
            mode: mode as 'PRINT' | 'REPRINT',
            confirmed: confirm,
            bytes: bytes!,
          });
    } catch {
      outcome = { state: 'UNKNOWN', errorCode: 'WRITE_UNCERTAIN' };
      adapter.disconnect();
    }
    if (!mounted.current) return;
    setConfirm(false);
    const value = { body: { ...reference, ...outcome }, key: crypto.randomUUID(), outcome };
    setPending(value);
    // Display a persisted terminal state only after API acceptance. Saving never sends bytes again.
    await saveResult(value);
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="print-title"
    >
      <DialogTitle id="print-title">{t('printers.documentTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {failure != null && (
            <Alert severity="error">
              {failure instanceof PrinterError
                ? t(`printers.${failure.code}`, { defaultValue: t('printers.CONNECTION_FAILED') })
                : documentError(failure, t)}
            </Alert>
          )}
          {capability !== 'AVAILABLE' && <Typography>{t(`printers.${capability}`)}</Typography>}
          <FormControl disabled={busy || Boolean(pending)}>
            <InputLabel shrink htmlFor="print-profile">
              {t('printers.printer')}
            </InputLabel>
            <NativeSelect
              value={profile?.id ?? ''}
              inputProps={{ id: 'print-profile' }}
              onChange={(event) => {
                setSelection(event.target.value);
                adapter.disconnect();
              }}
            >
              <option value="">{t('printers.choose')}</option>
              {profiles.data?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </NativeSelect>
          </FormControl>
          <Typography role="status">{t(`printers.${connection.state}`)}</Typography>
          <Button
            disabled={
              !ready ||
              busy ||
              Boolean(pending) ||
              capability !== 'AVAILABLE' ||
              connection.state !== 'DISCONNECTED'
            }
            onClick={() => void perform(() => adapter.connect(profile!))}
          >
            {t('printers.connect')}
          </Button>
          <Button
            disabled={
              !ready ||
              busy ||
              Boolean(pending) ||
              capability !== 'AVAILABLE' ||
              connection.state !== 'CONNECTED'
            }
            onClick={() => void perform(() => send(true))}
          >
            {t('printers.test')}
          </Button>
          {result && (
            <Typography role="status" data-testid="document-print-result" data-state={result.state}>
              {t(`printers.document${result.state}`)}
            </Typography>
          )}
          {pending && (
            <>
              <Alert severity="warning">{t('printers.resultUnsaved')}</Alert>
              <Button disabled={busy} onClick={() => void perform(() => saveResult(pending))}>
                {t('printers.saveResult')}
              </Button>
            </>
          )}
          {confirm && <Alert severity="warning">{t('printers.reprintWarning')}</Alert>}
          <Typography variant="caption">{t('printers.documentHelp')}</Typography>
          {!failure && <DocumentActions document={document} disabled={busy} onDenied={setError} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          {t('documents.close')}
        </Button>
        {failure != null && !pending && (
          <Button
            disabled={busy}
            onClick={() => {
              setError(null);
              void data.refetch();
              void history.refetch();
              void profiles.refetch();
              void preference.refetch();
            }}
          >
            {t('documents.refresh')}
          </Button>
        )}
        <Button
          disabled={
            !ready ||
            busy ||
            Boolean(pending) ||
            capability !== 'AVAILABLE' ||
            connection.state !== 'CONNECTED'
          }
          onClick={() => {
            if (reprint && !confirm) setConfirm(true);
            else void perform(() => send());
          }}
        >
          {t(confirm ? 'printers.confirmReprint' : reprint ? 'printers.reprint' : 'printers.print')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import {
  Alert,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  NativeSelect,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PrinterPreferenceResourceSchema } from '@warehouse/contracts';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import {
  PrinterError,
  type PrinterAdapter,
  type PrinterProfile,
  type TestResult,
} from './printer-adapter.js';
import { WebBluetoothPrinterAdapter } from './web-bluetooth-adapter.js';

type Preference = ReturnType<typeof PrinterPreferenceResourceSchema.parse>;
export function PrinterPreferencePage({ adapter }: { adapter?: PrinterAdapter }) {
  const { user } = useSession();
  return user ? (
    <PrinterPreferencePanel key={user.id} actorId={user.id} {...(adapter ? { adapter } : {})} />
  ) : null;
}
function PrinterPreferencePanel({
  actorId,
  adapter: injected,
}: {
  actorId: string;
  adapter?: PrinterAdapter;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [adapter] = useState(() => injected ?? new WebBluetoothPrinterAdapter());
  const connection = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);
  const capability = adapter.capability();
  const key = ['printer-preference', actorId];
  const profiles = useQuery({
    queryKey: ['approved-printers', actorId],
    queryFn: () => apiRequest<{ data: PrinterProfile[] }>('/printer-profiles'),
  });
  const preference = useQuery({
    queryKey: key,
    queryFn: () => apiRequest<{ data: Preference }>('/me/printer-preference'),
  });
  const [selection, setSelection] = useState<string | null>(null);
  const selectedId = selection ?? preference.data?.data?.printerProfileId ?? '';
  const profile = profiles.data?.data.find((row) => row.id === selectedId && row.active);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      adapter.disconnect();
    };
  }, [adapter]);
  // A changed/archived server profile invalidates the old transport configuration.
  useEffect(() => {
    adapter.disconnect();
  }, [adapter, profile?.id, profile?.version]);
  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await action();
    } catch (failure) {
      if (mounted.current) setError(failure);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function savePreference(lastTestResult?: TestResult['state']) {
    const response = await apiRequest<{ data: Preference }>('/me/printer-preference', {
      method: 'PUT',
      body: {
        printerProfileId: selectedId,
        ...(connection.deviceLabel ? { deviceLabel: connection.deviceLabel } : {}),
        ...(lastTestResult ? { lastTestResult } : {}),
      },
    });
    client.setQueryData(key, response);
    if (mounted.current) setSaved(true);
  }
  async function testPrinter() {
    const printerProfileId = selectedId;
    setResult(null);
    // The authenticated API must accept TEST_PRINT before any physical write.
    await apiRequest('/output-attempts', {
      method: 'POST',
      body: { mode: 'TEST_PRINT', printerProfileId, state: 'STARTED' },
    });
    // Leaving the page can also change the authenticated account. Do not start
    // device work or persist an old user's result under a subsequent session.
    if (!mounted.current) return;
    const outcome = await adapter.test();
    if (!mounted.current) return;
    setResult(outcome);
    await apiRequest('/output-attempts', {
      method: 'POST',
      body: { mode: 'TEST_PRINT', printerProfileId, ...outcome },
    });
    // A log/preference failure must not send the bytes again.
    if (mounted.current) await savePreference(outcome.state);
  }
  const failure = error ?? profiles.error ?? preference.error;
  const lastResult =
    result?.state ??
    (preference.data?.data?.printerProfileId === selectedId
      ? preference.data.data.lastTestResult
      : null);
  const ready =
    Boolean(profile) &&
    !profiles.isPending &&
    !preference.isPending &&
    !profiles.isError &&
    !preference.isError;
  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: 2.5 }}
      aria-label={t('printers.personal')}
    >
      <Stack spacing={2}>
        <Typography variant="h6">{t('printers.personal')}</Typography>
        <Typography color="text.secondary">{t('printers.personalHelp')}</Typography>
        {(profiles.isPending || preference.isPending) && (
          <CircularProgress aria-label={t('common.loading')} />
        )}
        {failure != null && (
          <Alert severity="error">
            {failure instanceof PrinterError
              ? t(`printers.${failure.code}`, { defaultValue: t('printers.CONNECTION_FAILED') })
              : localizedErrorMessage(failure, t)}
          </Alert>
        )}
        {(profiles.isError || preference.isError) && (
          <Button
            onClick={() => {
              void profiles.refetch();
              void preference.refetch();
            }}
          >
            {t('administration.retry')}
          </Button>
        )}
        {capability !== 'AVAILABLE' && (
          <Typography color="text.secondary">{t(`printers.${capability}`)}</Typography>
        )}
        <FormControl
          fullWidth
          disabled={busy || connection.state === 'CONNECTING' || connection.state === 'TESTING'}
        >
          <InputLabel htmlFor="personal-printer" shrink>
            {t('printers.printer')}
          </InputLabel>
          <NativeSelect
            inputProps={{ id: 'personal-printer' }}
            value={profile ? selectedId : ''}
            onChange={(event) => {
              adapter.disconnect();
              setSelection(event.target.value);
              setResult(null);
              setError(null);
              setSaved(false);
            }}
          >
            <option value="">{t('printers.choose')}</option>
            {profiles.data?.data
              .filter((row) => row.active)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
          </NativeSelect>
        </FormControl>
        {selectedId && !profile && !profiles.isPending && (
          <Typography>{t('printers.missing')}</Typography>
        )}
        {!profiles.isPending && profiles.data?.data.filter((row) => row.active).length === 0 && (
          <Typography>{t('printers.empty')}</Typography>
        )}
        <Typography role="status">
          {t(`printers.${connection.state}`)}
          {connection.deviceLabel ? ` · ${connection.deviceLabel}` : ''}
        </Typography>
        <Stack spacing={1}>
          <Button
            disabled={!ready || busy || selectedId === preference.data?.data?.printerProfileId}
            onClick={() => void perform(() => savePreference())}
          >
            {t('printers.savePreference')}
          </Button>
          <Button
            variant="outlined"
            disabled={
              !ready || busy || capability !== 'AVAILABLE' || connection.state !== 'DISCONNECTED'
            }
            onClick={() => void perform(() => adapter.connect(profile!))}
          >
            {t('printers.connect')}
          </Button>
          <Button
            variant="contained"
            disabled={!ready || busy || connection.state !== 'CONNECTED'}
            onClick={() => void perform(testPrinter)}
          >
            {t('printers.test')}
          </Button>
          <Button
            disabled={busy || connection.state === 'DISCONNECTED'}
            onClick={() => adapter.disconnect()}
          >
            {t('printers.disconnect')}
          </Button>
        </Stack>
        {lastResult && (
          <Typography role="status" data-testid="printer-test-result" data-state={lastResult}>
            {t(`printers.${lastResult}`)}
          </Typography>
        )}
        {saved && <Typography role="status">{t('administration.saved')}</Typography>}
        <Typography variant="caption" color="text.secondary">
          {t('printers.testHelp')}
        </Typography>
      </Stack>
    </Paper>
  );
}

import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PrinterProfileWriteSchema,
  PrinterProfileUpdateSchema,
  type PrinterProfileResourceSchema,
} from '@warehouse/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { ApiProblem } from '../../lib/api/problem.js';

type Profile = ReturnType<typeof PrinterProfileResourceSchema.parse>;
const fields = [
  'name',
  'model',
  'serviceUuid',
  'writeCharacteristicUuid',
  'maxChunkBytes',
  'interChunkDelayMs',
] as const;
const options = {
  writeMode: ['WITH_RESPONSE', 'WITHOUT_RESPONSE'],
  paperWidthMm: ['58', '80'],
  encoding: ['CP850', 'CP437', 'UTF-8'],
};
function values(profile: Profile | null) {
  return {
    name: profile?.name ?? '',
    model: profile?.model ?? '',
    serviceUuid: profile?.serviceUuid ?? '',
    writeCharacteristicUuid: profile?.writeCharacteristicUuid ?? '',
    maxChunkBytes: String(profile?.maxChunkBytes ?? 100),
    interChunkDelayMs: String(profile?.interChunkDelayMs ?? 20),
    writeMode: profile?.writeMode ?? 'WITH_RESPONSE',
    paperWidthMm: String(profile?.paperWidthMm ?? 58),
    encoding: profile?.encoding ?? 'CP850',
  };
}
export function PrinterProfilePage() {
  const { user } = useSession();
  const { t } = useTranslation();
  if (user?.role !== 'ADMINISTRATOR')
    return <Alert severity="error">{t('administration.denied')}</Alert>;
  return <Directory key={user.id} actorId={user.id} />;
}
function Directory({ actorId }: { actorId: string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Profile | 'new' | null>(null);
  const [saved, setSaved] = useState(false);
  const profiles = useQuery({
    queryKey: ['printer-profiles', actorId],
    queryFn: ({ signal }) => apiRequest<{ data: Profile[] }>('/printer-profiles', { signal }),
    retry: false,
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        {t('printers.title')}
      </Typography>
      <Typography>{t('printers.help')}</Typography>
      <Button
        variant="contained"
        onClick={() => {
          setSelected('new');
          setSaved(false);
        }}
      >
        {t('printers.new')}
      </Button>
      {saved && <Alert severity="success">{t('administration.saved')}</Alert>}
      {profiles.isLoading && <CircularProgress aria-label={t('administration.loading')} />}
      {profiles.error && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void profiles.refetch()}>{t('administration.retry')}</Button>
          }
        >
          {localizedErrorMessage(profiles.error, t)}
        </Alert>
      )}
      {profiles.data?.data.length === 0 && <Typography>{t('printers.empty')}</Typography>}
      {profiles.data?.data.map((profile) => (
        <Paper key={profile.id} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6">{profile.name}</Typography>
          <Typography>
            {profile.model} · {profile.paperWidthMm} mm · {profile.encoding} ·{' '}
            {t(profile.active ? 'common.active' : 'administration.inactive')}
          </Typography>
          <Button
            aria-label={t('administration.editNamed', { name: profile.name })}
            onClick={() => {
              setSelected(profile);
              setSaved(false);
            }}
          >
            {t('administration.edit')}
          </Button>
        </Paper>
      ))}
      {selected && (
        <Editor
          key={selected === 'new' ? 'new' : `${selected.id}:${selected.version}`}
          profile={selected === 'new' ? null : selected}
          onCancel={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            setSaved(true);
          }}
        />
      )}
    </Stack>
  );
}
function Editor({
  profile: initial,
  onCancel,
  onSaved,
}: {
  profile: Profile | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [profile, setProfile] = useState(initial);
  const [form, setForm] = useState(values(initial));
  const [active, setActive] = useState(initial?.active ?? true);
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiRequest(profile ? `/printer-profiles/${profile.id}` : '/printer-profiles', {
        method: profile ? 'PATCH' : 'POST',
        body,
      }),
    retry: false,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['printer-profiles'] });
      onSaved();
    },
  });
  const reload = useMutation({
    mutationFn: async () => {
      const response = await apiRequest<{ data: Profile[] }>('/printer-profiles');
      const current = response.data.find((row) => row.id === profile?.id);
      if (!current) throw new Error(t('printers.missing'));
      return current;
    },
    onSuccess: (current) => {
      setProfile(current);
      setForm(values(current));
      setActive(current.active);
      setReason('');
      setInvalid(false);
      save.reset();
    },
  });
  const busy = save.isPending || reload.isPending;
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack
        component="form"
        noValidate
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          const body = {
            ...form,
            commandDialect: 'ESC_POS',
            paperWidthMm: Number(form.paperWidthMm),
            maxChunkBytes: form.maxChunkBytes.trim() ? Number(form.maxChunkBytes) : NaN,
            interChunkDelayMs: form.interChunkDelayMs.trim() ? Number(form.interChunkDelayMs) : NaN,
            ...(profile
              ? { expectedVersion: profile.version, active, reason: reason.trim() || null }
              : {}),
          };
          const result = (
            profile ? PrinterProfileUpdateSchema : PrinterProfileWriteSchema
          ).safeParse(body);
          if (!result.success || (profile?.active && !active && !reason.trim())) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          save.mutate(result.data);
        }}
      >
        <Typography variant="h6" component="h2">
          {t(profile ? 'printers.edit' : 'printers.new')}
        </Typography>
        {invalid && <Alert severity="error">{t('printers.validation')}</Alert>}
        {(save.error || reload.error) && (
          <Alert severity="error">{localizedErrorMessage(reload.error ?? save.error, t)}</Alert>
        )}
        {save.error instanceof ApiProblem && save.error.code === 'OPTIMISTIC_CONFLICT' && (
          <Button disabled={busy} onClick={() => reload.mutate()}>
            {t('printers.reload')}
          </Button>
        )}
        <Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
          <Stack spacing={2}>
            {fields.map((field) => (
              <TextField
                key={field}
                label={t(`printers.${field}`)}
                value={form[field]}
                type={
                  field === 'maxChunkBytes' || field === 'interChunkDelayMs' ? 'number' : 'text'
                }
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
              />
            ))}
            {Object.entries(options).map(([field, choices]) => (
              <TextField
                select
                key={field}
                label={t(`printers.${field}`)}
                value={form[field as keyof typeof form]}
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
              >
                {choices.map((choice) => (
                  <MenuItem key={choice} value={choice}>
                    {choice}
                  </MenuItem>
                ))}
              </TextField>
            ))}
            {profile && (
              <>
                <FormControlLabel
                  label={t('common.active')}
                  control={
                    <Checkbox
                      checked={active}
                      onChange={(event) => setActive(event.target.checked)}
                    />
                  }
                />
                <TextField
                  label={t('administration.reason')}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  helperText={t('printers.archiveHelp')}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
              </>
            )}
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained">
                {t(busy ? 'administration.saving' : 'printers.save')}
              </Button>
              <Button onClick={onCancel}>{t('administration.cancel')}</Button>
            </Stack>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BusinessSettingUpdateSchema,
  UserCreateSchema,
  UserUpdateSchema,
  type SessionUser,
} from '@warehouse/contracts';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { ApiProblem } from '../../lib/api/problem.js';

interface User extends SessionUser {
  version: number;
}
interface BusinessSettings {
  version: number;
  currencyCode: string;
  businessTimezone: string;
  currencyScale: number;
  partnerShareRate: string;
  moneyRoundingMode: string;
}
const isStale = (error: unknown) =>
  error instanceof ApiProblem && error.code === 'OPTIMISTIC_CONFLICT';

export function UserSettingsPages() {
  const { t } = useTranslation();
  const { user } = useSession();
  if (user?.role !== 'ADMINISTRATOR')
    return <Alert severity="error">{t('administration.denied')}</Alert>;
  return <UserDirectory key={user.id} actorId={user.id} />;
}

function UserDirectory({ actorId }: { actorId: string }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [selected, setSelected] = useState<User | 'new' | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [success, setSuccess] = useState(false);
  const cursor = cursors.at(-1);
  const query = new URLSearchParams({ search, limit: '25' });
  if (active) query.set('active', active);
  if (cursor) query.set('cursor', cursor);
  const users = useQuery({
    queryKey: ['administration-users', actorId, search, active, cursor],
    queryFn: ({ signal }) =>
      apiRequest<{ data: User[]; page?: { hasNextPage: boolean; nextCursor: string | null } }>(
        `/users?${query}`,
        { signal },
      ),
    retry: false,
  });
  const choose = (value: User | 'new') => {
    setSelected(value);
    setSuccess(false);
  };
  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        spacing={2}
      >
        <Typography variant="h4" component="h1">
          {t('nav.users')}
        </Typography>
        <Button variant="contained" onClick={() => choose('new')}>
          {t('administration.newUser')}
        </Button>
      </Stack>
      <Typography color="text.secondary">{t('administration.usersHelp')}</Typography>
      {success && <Alert severity="success">{t('administration.saved')}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label={t('administration.search')}
          value={search}
          fullWidth
          onChange={(event) => {
            setSearch(event.target.value);
            setCursors([]);
          }}
          slotProps={{ htmlInput: { maxLength: 120 } }}
        />
        <TextField
          select
          label={t('administration.status')}
          value={active}
          sx={{ minWidth: 180 }}
          onChange={(event) => {
            setActive(event.target.value);
            setCursors([]);
          }}
        >
          <MenuItem value="">{t('administration.all')}</MenuItem>
          <MenuItem value="true">{t('common.active')}</MenuItem>
          <MenuItem value="false">{t('administration.inactive')}</MenuItem>
        </TextField>
      </Stack>
      {users.isLoading && <CircularProgress aria-label={t('administration.loading')} />}
      {users.error && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              onClick={() => {
                if (cursors.length) setCursors([]);
                else void users.refetch();
              }}
            >
              {t('administration.retry')}
            </Button>
          }
        >
          {localizedErrorMessage(users.error, t)}
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(260px, 1fr) minmax(320px, 1fr)' },
        }}
      >
        <Stack spacing={1.5}>
          {users.data?.data.map((row) => (
            <Paper key={row.id} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6">{row.displayName}</Typography>
              <Typography color="text.secondary">
                {row.username} · {t(`administration.${row.role}`)} ·{' '}
                {row.active ? t('common.active') : t('administration.inactive')}
              </Typography>
              <Button
                aria-label={t('administration.editNamed', { name: row.displayName })}
                onClick={() => choose(row)}
              >
                {t('administration.edit')}
              </Button>
            </Paper>
          ))}
          {users.data?.data.length === 0 && <Typography>{t('administration.empty')}</Typography>}
          <Stack direction="row" spacing={1}>
            <Button
              disabled={!cursors.length || users.isFetching}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              {t('administration.previous')}
            </Button>
            <Button
              disabled={
                !users.data?.page?.hasNextPage || !users.data.page.nextCursor || users.isFetching
              }
              onClick={() => {
                const next = users.data?.page?.nextCursor;
                if (next) setCursors((previous) => [...previous, next]);
              }}
            >
              {t('administration.next')}
            </Button>
          </Stack>
        </Stack>
        {selected && (
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, alignSelf: 'start' }}>
            <UserEditor
              key={
                selected === 'new' ? 'new' : `${selected.id}:${selected.version}:${editorRevision}`
              }
              user={selected === 'new' ? null : selected}
              onReload={(current) => {
                setSelected(current);
                setEditorRevision((revision) => revision + 1);
              }}
              onSaved={() => {
                setSelected(null);
                setSuccess(true);
              }}
              onCancel={() => setSelected(null)}
            />
          </Paper>
        )}
      </Box>
    </Stack>
  );
}

function UserEditor({
  user,
  onSaved,
  onReload,
  onCancel,
}: {
  user: User | null;
  onSaved: () => void;
  onReload: (user: User) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [username, setUsername] = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [role, setRole] = useState(user?.role ?? 'DRIVER');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiRequest<{ data: User }>(user ? `/users/${user.id}` : '/users', {
        method: user ? 'PATCH' : 'POST',
        body,
      }),
    retry: false,
    onSuccess: async () => {
      setPassword('');
      await client.invalidateQueries({ queryKey: ['administration-users'] });
      await client.invalidateQueries({ queryKey: ['session'] });
      onSaved();
    },
  });
  const reload = useMutation({
    mutationFn: () => apiRequest<{ data: User }>(`/users/${user!.id}`),
    onSuccess: (response) => onReload(response.data),
  });
  const error = reload.error ?? save.error;
  return (
    <Stack
      component="form"
      spacing={2}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (save.isPending || reload.isPending) return;
        const body = user
          ? {
              expectedVersion: user.version,
              displayName,
              role,
              active,
              ...(password ? { password } : {}),
              ...(reason.trim() ? { reason } : {}),
            }
          : { username, displayName, role, password };
        const result = (user ? UserUpdateSchema : UserCreateSchema).safeParse(body);
        if (!result.success || (user?.active && !active && !reason.trim())) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        save.mutate(result.data);
      }}
    >
      <Typography variant="h6" component="h2">
        {user ? t('administration.editUser') : t('administration.newUser')}
      </Typography>
      {invalid && <Alert severity="error">{t('administration.validation')}</Alert>}
      {error && <Alert severity="error">{localizedErrorMessage(error, t)}</Alert>}
      {isStale(save.error) && (
        <Button disabled={reload.isPending || save.isPending} onClick={() => reload.mutate()}>
          {t('administration.reload')}
        </Button>
      )}
      <Box
        component="fieldset"
        disabled={save.isPending || reload.isPending}
        sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
      >
        <Stack spacing={2}>
          <TextField
            label={t('administration.username')}
            value={username}
            disabled={Boolean(user)}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            label={t('administration.displayName')}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 160 } }}
          />
          <TextField
            select
            label={t('administration.role')}
            value={role}
            onChange={(event) => setRole(event.target.value as User['role'])}
          >
            <MenuItem value="DRIVER">{t('administration.DRIVER')}</MenuItem>
            <MenuItem value="ADMINISTRATOR">{t('administration.ADMINISTRATOR')}</MenuItem>
          </TextField>
          <TextField
            label={t('administration.password')}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            helperText={t(user ? 'administration.passwordOptional' : 'administration.passwordHelp')}
            slotProps={{ htmlInput: { maxLength: 1024 } }}
          />
          {user && (
            <>
              <TextField
                select
                label={t('administration.status')}
                value={active ? 'true' : 'false'}
                onChange={(event) => setActive(event.target.value === 'true')}
              >
                <MenuItem value="true">{t('common.active')}</MenuItem>
                <MenuItem value="false">{t('administration.inactive')}</MenuItem>
              </TextField>
              <Typography variant="body2" color="text.secondary">
                {t('administration.deactivationHelp')}
              </Typography>
              <TextField
                label={t('administration.reason')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                helperText={t('administration.reasonHelp')}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            </>
          )}
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" disabled={save.isPending}>
              {t(save.isPending ? 'administration.saving' : 'administration.saveUser')}
            </Button>
            <Button onClick={onCancel}>{t('administration.cancel')}</Button>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}

export function BusinessSettingsPanel() {
  const { user } = useSession();
  if (user?.role !== 'ADMINISTRATOR') return null;
  return <BusinessSettingsLoader key={user.id} actorId={user.id} />;
}

function BusinessSettingsLoader({ actorId }: { actorId: string }) {
  const { t } = useTranslation();
  const settings = useQuery({
    queryKey: ['business-settings', actorId],
    queryFn: ({ signal }) =>
      apiRequest<{ data: BusinessSettings }>('/settings/business', { signal }),
    retry: false,
  });
  const data = settings.data?.data;
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h5" component="h2">
          {t('administration.businessSettings')}
        </Typography>
        {settings.isLoading && <CircularProgress aria-label={t('administration.loading')} />}
        {settings.error && (
          <Alert
            severity="error"
            action={
              <Button onClick={() => void settings.refetch()}>{t('administration.retry')}</Button>
            }
          >
            {localizedErrorMessage(settings.error, t)}
          </Alert>
        )}
        {data && <BusinessSettingsEditor settings={data} />}
      </Stack>
    </Paper>
  );
}

function BusinessSettingsEditor({ settings }: { settings: BusinessSettings }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [currencyCode, setCurrencyCode] = useState(settings.currencyCode);
  const [businessTimezone, setBusinessTimezone] = useState(settings.businessTimezone);
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState(settings.version);
  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiRequest<{ data: BusinessSettings }>('/settings/business', { method: 'PATCH', body }),
    retry: false,
    onSuccess: async (response) => {
      setCurrencyCode(response.data.currencyCode);
      setBusinessTimezone(response.data.businessTimezone);
      setVersion(response.data.version);
      setReason('');
      setSaved(true);
      await client.invalidateQueries({ queryKey: ['business-settings'] });
    },
  });
  const reload = useMutation({
    mutationFn: () => apiRequest<{ data: BusinessSettings }>('/settings/business'),
    onSuccess: (response) => {
      setCurrencyCode(response.data.currencyCode);
      setBusinessTimezone(response.data.businessTimezone);
      setVersion(response.data.version);
      setReason('');
      setInvalid(false);
      setSaved(false);
      save.reset();
    },
  });
  return (
    <Stack
      component="form"
      spacing={2}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (save.isPending || reload.isPending) return;
        const result = BusinessSettingUpdateSchema.safeParse({
          expectedVersion: version,
          currencyCode,
          businessTimezone,
          reason,
        });
        if (!result.success) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        setSaved(false);
        save.mutate(result.data);
      }}
    >
      <Typography color="text.secondary">{t('administration.settingsHelp')}</Typography>
      {saved && <Alert severity="success">{t('administration.saved')}</Alert>}
      {invalid && <Alert severity="error">{t('administration.settingsValidation')}</Alert>}
      {(save.error || reload.error) && (
        <Alert severity="error">{localizedErrorMessage(reload.error ?? save.error, t)}</Alert>
      )}
      {isStale(save.error) && (
        <Button disabled={reload.isPending || save.isPending} onClick={() => reload.mutate()}>
          {t('administration.reload')}
        </Button>
      )}
      <Box
        component="fieldset"
        disabled={save.isPending || reload.isPending}
        sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
      >
        <Stack spacing={2}>
          <TextField
            label={t('administration.currency')}
            value={currencyCode}
            onChange={(event) => setCurrencyCode(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 3 } }}
          />
          <TextField
            label={t('administration.timezone')}
            value={businessTimezone}
            onChange={(event) => setBusinessTimezone(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <Typography variant="body2">{t('administration.fixedRules')}</Typography>
          <TextField
            label={t('administration.reason')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <Button type="submit" variant="contained" disabled={save.isPending}>
            {t(save.isPending ? 'administration.saving' : 'administration.saveSettings')}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

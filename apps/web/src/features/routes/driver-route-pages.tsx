import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { formatDecimal } from '../../i18n/format.js';
import { idempotencyKey } from '../../lib/api/idempotency.js';
import { RouteHistory } from './route-history.js';
import { useRouteDetail, useRoutes } from './route-queries.js';

interface LoadValues {
  lines: Array<{ productId: string; quantity: string }>;
}

export function DriverRoutePages() {
  const { t } = useTranslation();
  const routes = useRoutes();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!selected && routes.data?.data.length) {
      const active = routes.data.data.find((route) => route.state !== 'CLOSED');
      setSelected((active ?? routes.data.data[0])!.id);
    }
  }, [routes.data, selected]);
  const detail = useRouteDetail(selected);
  const form = useForm<LoadValues>({
    defaultValues: { lines: [{ productId: '', quantity: '1' }] },
  });
  const loadLines = useFieldArray({ control: form.control, name: 'lines' });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['routes'] });
    await client.invalidateQueries({ queryKey: ['routes', selected] });
  };
  const draft = useMutation({
    mutationFn: (values: LoadValues) =>
      apiRequest(`/routes/${selected}/load`, {
        method: 'PUT',
        body: {
          expectedVersion: detail.data?.data.load?.version ?? detail.data?.data.route.version,
          lines: values.lines,
        },
      }),
    onSuccess: refresh,
  });
  const command = useMutation({
    mutationFn: (action: 'confirmation' | 'start' | 'return') => {
      const route = detail.data!.data;
      const expectedVersion = action === 'confirmation' ? route.load!.version : route.route.version;
      const path = action === 'confirmation' ? 'load/confirmation' : action;
      return apiRequest(`/routes/${route.route.id}/${path}`, {
        method: 'POST',
        idempotencyKey: idempotencyKey(crypto.randomUUID()),
        body: { expectedVersion },
      });
    },
    onSuccess: refresh,
  });
  if (routes.isLoading) return <CircularProgress aria-label={t('routes.loadingAssigned')} />;
  const current = detail.data?.data;
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('routes.myRoutes')}</Typography>
      {(routes.error || detail.error || draft.error || command.error) && (
        <Alert severity="error">
          {localizedErrorMessage(routes.error ?? detail.error ?? draft.error ?? command.error, t)}
        </Alert>
      )}
      <TextField
        select
        label={t('routes.assignedRoute')}
        value={selected ?? ''}
        onChange={(event) => setSelected(event.target.value)}
      >
        {routes.data?.data.map((route) => (
          <MenuItem key={route.id} value={route.id}>
            {route.routeNumber} · {t(`status.${route.state}`, { defaultValue: route.state })}
          </MenuItem>
        ))}
      </TextField>
      {current?.route.state === 'PREPARING' && (
        <Stack
          component="form"
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          onSubmit={(event) => void form.handleSubmit((values) => draft.mutate(values))(event)}
        >
          <Stack spacing={1} sx={{ flexGrow: 1 }}>
            {loadLines.fields.map((field, index) => (
              <Stack key={field.id} direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField
                  label={t('common.productId')}
                  {...form.register(`lines.${index}.productId`, { required: true })}
                />
                <TextField
                  label={t('routes.loadQuantity')}
                  {...form.register(`lines.${index}.quantity`, { required: true })}
                />
                <Button
                  type="button"
                  disabled={loadLines.fields.length === 1}
                  onClick={() => loadLines.remove(index)}
                >
                  {t('common.remove')}
                </Button>
              </Stack>
            ))}
            <Stack direction="row" spacing={1}>
              <Button
                type="button"
                onClick={() => loadLines.append({ productId: '', quantity: '1' })}
              >
                {t('routes.addProduct')}
              </Button>
              <Button type="submit" variant="outlined">
                {t('routes.saveFullLoad')}
              </Button>
            </Stack>
          </Stack>
          {current.load?.state === 'DRAFT' && (
            <Button variant="contained" onClick={() => command.mutate('confirmation')}>
              {t('routes.confirmLoad')}
            </Button>
          )}
          {current.load?.state === 'CONFIRMED' && (
            <Button variant="contained" onClick={() => command.mutate('start')}>
              {t('routes.startRoute')}
            </Button>
          )}
        </Stack>
      )}
      {current?.route.state === 'EN_ROUTE' && (
        <>
          <Typography variant="h6">{t('routes.availableInventory')}</Typography>
          {current.balances.map((balance) => (
            <Typography key={balance.id}>
              {balance.productName}: {formatDecimal(balance.quantity)}
            </Typography>
          ))}
          <Button variant="contained" onClick={() => command.mutate('return')}>
            {t('routes.markReturned')}
          </Button>
        </>
      )}
      {current && <RouteHistory detail={current} />}
    </Stack>
  );
}

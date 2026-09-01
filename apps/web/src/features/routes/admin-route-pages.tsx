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
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { formatDate } from '../../i18n/format.js';
import { ReconciliationPage } from './reconciliation-page.js';
import { RouteHistory } from './route-history.js';
import { RouteOverview } from './route-overview.js';
import { useRouteDetail, useRoutes } from './route-queries.js';
import type { RouteResource } from './route-types.js';

interface CreateRouteValues {
  routeNumber: string;
  originLocationId: string;
  driverId: string;
  vehicleId: string;
  businessDate: string;
}

export function AdminRoutePages() {
  const { t } = useTranslation();
  const routes = useRoutes();
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(() => searchParams.get('routeId'));
  const detail = useRouteDetail(selected);
  const form = useForm<CreateRouteValues>({
    defaultValues: {
      routeNumber: '',
      originLocationId: '',
      driverId: '',
      vehicleId: '',
      businessDate: new Date().toISOString().slice(0, 10),
    },
  });
  const create = useMutation({
    mutationFn: (values: CreateRouteValues) =>
      apiRequest<{ data: RouteResource }>('/routes', { method: 'POST', body: values }),
    onSuccess: async (response) => {
      form.reset({ ...form.getValues(), routeNumber: '' });
      setSelected(response.data.id);
      setSearchParams({ routeId: response.data.id }, { replace: true });
      await client.invalidateQueries({ queryKey: ['routes'] });
    },
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('routes.title')}</Typography>
      {(routes.error || create.error || detail.error) && (
        <Alert severity="error">
          {localizedErrorMessage(routes.error ?? create.error ?? detail.error, t)}
        </Alert>
      )}
      <Stack
        component="form"
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        onSubmit={(event) => void form.handleSubmit((values) => create.mutate(values))(event)}
      >
        <TextField
          label={t('routes.routeNumber')}
          {...form.register('routeNumber', { required: true })}
        />
        <TextField
          label={t('routes.originLocationId')}
          {...form.register('originLocationId', { required: true })}
        />
        <TextField
          label={t('routes.driverId')}
          {...form.register('driverId', { required: true })}
        />
        <TextField
          label={t('routes.vehicleId')}
          {...form.register('vehicleId', { required: true })}
        />
        <TextField
          type="date"
          label={t('routes.businessDate')}
          {...form.register('businessDate')}
        />
        <Button type="submit" variant="contained" disabled={create.isPending}>
          {t('common.create')}
        </Button>
      </Stack>
      {routes.isLoading ? (
        <CircularProgress aria-label={t('routes.loading')} />
      ) : (
        <TextField
          select
          label={t('routes.openRoute')}
          value={selected ?? ''}
          onChange={(event) => {
            setSelected(event.target.value);
            setSearchParams({ routeId: event.target.value }, { replace: true });
          }}
        >
          {routes.data?.data.map((route) => (
            <MenuItem key={route.id} value={route.id}>
              {route.routeNumber} · {t(`status.${route.state}`, { defaultValue: route.state })} ·{' '}
              {formatDate(route.businessDate)}
            </MenuItem>
          ))}
        </TextField>
      )}
      {detail.data && (
        <>
          <RouteOverview detail={detail.data.data} />
          <RouteHistory detail={detail.data.data} />
          <ReconciliationPage detail={detail.data.data} />
        </>
      )}
    </Stack>
  );
}

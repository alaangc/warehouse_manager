import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { formatDate } from '../../i18n/format.js';
import { ReconciliationPage } from './reconciliation-page.js';
import { RouteHistory } from './route-history.js';
import { RouteOverview } from './route-overview.js';
import { useRouteDetail, useRoutes } from './route-queries.js';
import type { RouteResource } from './route-types.js';
import { RouteResourcePicker } from './route-resource-picker.js';
import { ReturnReceipt } from './return-receipt.js';
import { RouteScopeTabs } from './route-scope-tabs.js';

interface CreateRouteValues {
  routeNumber: string;
  originLocationId: string;
  driverId: string;
  vehicleId: string;
  businessDate: string;
}

export function AdminRoutePages() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState(() => searchParams.get('view') === 'history');
  const routes = useRoutes(history ? 'closed' : 'active');
  const [selected, setSelected] = useState<string | null>(() => searchParams.get('routeId'));
  const detail = useRouteDetail(selected);
  useEffect(() => {
    if (selected && detail.data?.data.route.state === 'CLOSED' && !history) {
      setHistory(true);
      setSearchParams({ view: 'history', routeId: selected }, { replace: true });
    }
  }, [selected, detail.data?.data.route.state, history, setSearchParams]);
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
    mutationFn: (values: CreateRouteValues) => {
      const { routeNumber, ...routeValues } = values;
      return apiRequest<{ data: RouteResource }>('/routes', {
        method: 'POST',
        body: {
          ...routeValues,
          ...(routeNumber.trim() ? { routeNumber: routeNumber.trim() } : {}),
        },
      });
    },
    onSuccess: async (response) => {
      form.reset({ ...form.getValues(), routeNumber: '' });
      setSelected(response.data.id);
      setSearchParams({ routeId: response.data.id }, { replace: true });
      await client.invalidateQueries({ queryKey: ['routes'] });
    },
  });
  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">{t('routes.title')}</Typography>
        <Button component={Link} to="/vehicles">
          {t('catalog.vehicles')}
        </Button>
      </Stack>
      <RouteScopeTabs
        history={history}
        onChange={(value) => {
          setHistory(value);
          setSelected(null);
          setSearchParams(value ? { view: 'history' } : {});
        }}
      />
      {(routes.error || create.error || detail.error) && (
        <Alert severity="error">
          {localizedErrorMessage(routes.error ?? create.error ?? detail.error, t)}
        </Alert>
      )}
      {!history && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack
            component="form"
            spacing={2}
            onSubmit={(event) => void form.handleSubmit((values) => create.mutate(values))(event)}
          >
            <TextField
              label={t('routes.routeNumber')}
              helperText={t('routes.routeNumberOptional')}
              {...form.register('routeNumber')}
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <RouteResourcePicker
                kind="locations"
                label={t('ui.branch')}
                value={form.watch('originLocationId')}
                onChange={(id) => form.setValue('originLocationId', id)}
              />
              <RouteResourcePicker
                kind="users"
                label={t('ui.seller')}
                value={form.watch('driverId')}
                onChange={(id) => form.setValue('driverId', id)}
              />
              <RouteResourcePicker
                kind="vehicles"
                label={t('ui.vehicle')}
                value={form.watch('vehicleId')}
                onChange={(id) => form.setValue('vehicleId', id)}
              />
            </Stack>
            <TextField
              type="date"
              label={t('routes.businessDate')}
              slotProps={{ inputLabel: { shrink: true } }}
              {...form.register('businessDate')}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={
                create.isPending ||
                !form.watch('originLocationId') ||
                !form.watch('driverId') ||
                !form.watch('vehicleId')
              }
            >
              {t('common.create')}
            </Button>
          </Stack>
        </Paper>
      )}
      {!routes.isLoading && routes.data?.data.length === 0 && (
        <Alert severity="info">
          {t(history ? 'routes.noClosedRoutes' : 'routes.noActiveRoutes')}
        </Alert>
      )}
      {routes.isLoading ? (
        <CircularProgress aria-label={t('routes.loading')} />
      ) : (
        <TextField
          select
          label={t('routes.openRoute')}
          value={routes.data?.data.some((route) => route.id === selected) ? selected : ''}
          onChange={(event) => {
            setSelected(event.target.value);
            setSearchParams(
              { ...(history ? { view: 'history' } : {}), routeId: event.target.value },
              { replace: true },
            );
          }}
        >
          <MenuItem value="" disabled>
            {t('routes.openRoute')}
          </MenuItem>
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
          <ReconciliationPage
            detail={detail.data.data}
            onClosed={() => {
              setSelected(null);
              setHistory(false);
              setSearchParams({}, { replace: true });
            }}
          />
          <ReturnReceipt detail={detail.data.data} />
        </>
      )}
    </Stack>
  );
}

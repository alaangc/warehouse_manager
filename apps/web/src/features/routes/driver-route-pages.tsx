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
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { completeIdempotentOperation, idempotencyKey } from '../../lib/api/idempotency.js';
import { RouteHistory } from './route-history.js';
import { RouteOverview } from './route-overview.js';
import { useRouteDetail, useRoutes } from './route-queries.js';

interface LoadValues {
  lines: Array<{ productId: string; quantity: string }>;
}

type RouteCommand = 'confirmation' | 'start' | 'return';

function newCommandOperationIds(): Record<RouteCommand, string> {
  return {
    confirmation: crypto.randomUUID(),
    start: crypto.randomUUID(),
    return: crypto.randomUUID(),
  };
}

export function DriverRoutePages() {
  const { t } = useTranslation();
  const routes = useRoutes();
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(() => searchParams.get('routeId'));
  const commandOperationIds = useRef(newCommandOperationIds());
  useEffect(() => {
    const operationIds = (commandOperationIds.current = newCommandOperationIds());
    return () => {
      Object.values(operationIds).forEach(completeIdempotentOperation);
    };
  }, [selected]);
  useEffect(() => {
    if (
      routes.data?.data.length &&
      (!selected || !routes.data.data.some((route) => route.id === selected))
    ) {
      const active = routes.data.data.find((route) => route.state !== 'CLOSED');
      const routeId = (active ?? routes.data.data[0])!.id;
      setSelected(routeId);
      setSearchParams({ routeId }, { replace: true });
    }
  }, [routes.data, selected, setSearchParams]);
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
    mutationFn: (action: RouteCommand) => {
      const route = detail.data!.data;
      const expectedVersion = action === 'confirmation' ? route.load!.version : route.route.version;
      const path = action === 'confirmation' ? 'load/confirmation' : action;
      return apiRequest(`/routes/${route.route.id}/${path}`, {
        method: 'POST',
        idempotencyKey: idempotencyKey(commandOperationIds.current[action]),
        body: { expectedVersion },
      });
    },
    onSuccess: async (_response, action) => {
      completeIdempotentOperation(commandOperationIds.current[action]);
      commandOperationIds.current[action] = crypto.randomUUID();
      await refresh();
    },
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
        onChange={(event) => {
          setSelected(event.target.value);
          setSearchParams({ routeId: event.target.value }, { replace: true });
        }}
      >
        {routes.data?.data.map((route) => (
          <MenuItem key={route.id} value={route.id}>
            {route.routeNumber} · {t(`status.${route.state}`, { defaultValue: route.state })}
          </MenuItem>
        ))}
      </TextField>
      {current && <RouteOverview detail={current} />}
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
        <Button variant="contained" onClick={() => command.mutate('return')}>
          {t('routes.markReturned')}
        </Button>
      )}
      {current && <RouteHistory detail={current} />}
    </Stack>
  );
}

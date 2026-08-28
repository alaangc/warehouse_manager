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
import { apiRequest } from '../../lib/api/client.js';
import { ReconciliationPage } from './reconciliation-page.js';
import { RouteHistory } from './route-history.js';
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
  const routes = useRoutes();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
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
      await client.invalidateQueries({ queryKey: ['routes'] });
    },
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Routes</Typography>
      {(routes.error || create.error || detail.error) && (
        <Alert severity="error">{(routes.error ?? create.error ?? detail.error)?.message}</Alert>
      )}
      <Stack
        component="form"
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        onSubmit={(event) => void form.handleSubmit((values) => create.mutate(values))(event)}
      >
        <TextField label="Route number" {...form.register('routeNumber', { required: true })} />
        <TextField
          label="Origin location ID"
          {...form.register('originLocationId', { required: true })}
        />
        <TextField label="Driver ID" {...form.register('driverId', { required: true })} />
        <TextField label="Vehicle ID" {...form.register('vehicleId', { required: true })} />
        <TextField type="date" label="Business date" {...form.register('businessDate')} />
        <Button type="submit" variant="contained" disabled={create.isPending}>
          Create
        </Button>
      </Stack>
      {routes.isLoading ? (
        <CircularProgress aria-label="Loading routes" />
      ) : (
        <TextField
          select
          label="Open route"
          value={selected ?? ''}
          onChange={(event) => setSelected(event.target.value)}
        >
          {routes.data?.data.map((route) => (
            <MenuItem key={route.id} value={route.id}>
              {route.routeNumber} · {route.state} · {route.businessDate}
            </MenuItem>
          ))}
        </TextField>
      )}
      {detail.data && (
        <>
          <RouteHistory detail={detail.data.data} />
          <ReconciliationPage detail={detail.data.data} />
        </>
      )}
    </Stack>
  );
}

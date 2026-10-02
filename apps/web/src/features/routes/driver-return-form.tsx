import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { initialReturnValues, ReturnFields, returnLines } from './return-fields.js';
import type { RouteDetail } from './route-types.js';

export function DriverReturnForm({ detail }: { detail: RouteDetail }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [values, setValues] = useState(() => initialReturnValues(detail));
  const request = useRef({ body: '', key: '' });
  const save = useMutation({
    mutationFn: () => {
      const body = { expectedVersion: detail.route.version, lines: returnLines(detail, values) };
      const serialized = JSON.stringify(body);
      if (request.current.body !== serialized)
        request.current = { body: serialized, key: crypto.randomUUID() };
      const action = detail.route.state === 'EN_ROUTE' ? 'return' : 'return-declaration';
      return apiRequest(`/routes/${detail.route.id}/${action}`, {
        method: 'POST',
        body,
        idempotencyKey: request.current.key,
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['routes'] }),
  });
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack
        component="form"
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault();
          if (!save.isPending) save.mutate();
        }}
      >
        <Typography variant="h6">{t('routes.declareReturn')}</Typography>
        <Typography color="text.secondary">{t('routes.declareReturnHelp')}</Typography>
        {save.error && <Alert severity="error">{localizedErrorMessage(save.error, t)}</Alert>}
        <ReturnFields
          detail={detail}
          values={values}
          disabled={save.isPending}
          onChange={(id, value) => setValues((previous) => ({ ...previous, [id]: value }))}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={save.isPending || !detail.load?.lines.length}
        >
          {t(detail.route.state === 'EN_ROUTE' ? 'routes.markReturned' : 'routes.saveReturn')}
        </Button>
      </Stack>
    </Paper>
  );
}

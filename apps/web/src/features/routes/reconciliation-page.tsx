import { Alert, Button, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { idempotencyKey } from '../../lib/api/idempotency.js';
import {
  initialReturnValues,
  ReturnFields,
  returnLines,
  type ReturnValue,
} from './return-fields.js';
import type { RouteDetail, RouteResource } from './route-types.js';

export function ReconciliationPage({
  detail,
  onClosed,
}: {
  detail: RouteDetail;
  onClosed?: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const initial = JSON.stringify(initialReturnValues(detail));
  const [values, setValues] = useState<Record<string, ReturnValue>>(() =>
    initialReturnValues(detail),
  );
  // Preserve edits when polling returns identical server values.
  useEffect(() => {
    setValues(JSON.parse(initial) as Record<string, ReturnValue>);
  }, [initial, detail.route.id]);
  const reconcile = useMutation({
    mutationFn: () =>
      apiRequest(`/routes/${detail.route.id}/reconciliation`, {
        method: 'PUT',
        idempotencyKey: idempotencyKey(crypto.randomUUID()),
        body: {
          expectedVersion: detail.route.version,
          lines: returnLines(detail, values),
        },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['routes', detail.route.id] }),
  });
  const close = useMutation({
    mutationFn: () =>
      apiRequest<{ data: RouteResource }>(`/routes/${detail.route.id}/close`, {
        method: 'POST',
        idempotencyKey: idempotencyKey(crypto.randomUUID()),
        body: { expectedVersion: detail.route.version },
      }),
    onSuccess: async () => {
      onClosed?.();
      await client.invalidateQueries({ queryKey: ['routes'] });
      await client.invalidateQueries({ queryKey: ['routes', detail.route.id] });
    },
  });
  if (detail.route.state !== 'RETURNED') return null;
  return (
    <Stack
      spacing={2}
      component="form"
      aria-label={t('routes.reconciliationLabel')}
      onSubmit={(event) => {
        event.preventDefault();
        if (detail.reconciliation) {
          if (!close.isPending) close.mutate();
        } else if (!reconcile.isPending) reconcile.mutate();
      }}
    >
      <Typography variant="h6">{t('routes.reconciliationTitle')}</Typography>
      {(reconcile.error || close.error) && (
        <Alert severity="error">{localizedErrorMessage(reconcile.error ?? close.error, t)}</Alert>
      )}
      {!detail.reconciliation && (
        <>
          {detail.returnDeclaration && (
            <Alert severity="info">{t('routes.reviewDeclaredReturn')}</Alert>
          )}
          <ReturnFields
            detail={detail}
            values={values}
            disabled={reconcile.isPending}
            onChange={(id, value) => setValues((previous) => ({ ...previous, [id]: value }))}
          />
        </>
      )}
      {!detail.reconciliation ? (
        <Button variant="contained" type="submit" disabled={reconcile.isPending}>
          {t('routes.approveReconciliation')}
        </Button>
      ) : (
        <Button variant="contained" type="submit" disabled={close.isPending}>
          {t('routes.closeRoute')}
        </Button>
      )}
    </Stack>
  );
}

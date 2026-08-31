import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { idempotencyKey } from '../../lib/api/idempotency.js';
import type { RouteDetail, RouteResource } from './route-types.js';

interface ReturnValue {
  physicalReturnQuantity: string;
  differenceReason: string;
}

export function ReconciliationPage({ detail }: { detail: RouteDetail }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, ReturnValue>>({});
  useEffect(() => {
    setValues(
      Object.fromEntries(
        (detail.load?.lines ?? []).map((line) => {
          const expected =
            detail.balances.find((balance) => balance.productId === line.productId)?.quantity ??
            line.quantity;
          return [line.productId, { physicalReturnQuantity: expected, differenceReason: '' }];
        }),
      ),
    );
  }, [detail.balances, detail.load]);
  const reconcile = useMutation({
    mutationFn: () =>
      apiRequest(`/routes/${detail.route.id}/reconciliation`, {
        method: 'PUT',
        idempotencyKey: idempotencyKey(crypto.randomUUID()),
        body: {
          expectedVersion: detail.route.version,
          lines: (detail.load?.lines ?? []).map((line) => {
            const expected =
              detail.balances.find((balance) => balance.productId === line.productId)?.quantity ??
              line.quantity;
            const current = values[line.productId] ?? {
              physicalReturnQuantity: '0',
              differenceReason: '',
            };
            return {
              productId: line.productId,
              physicalReturnQuantity: current.physicalReturnQuantity,
              ...(current.physicalReturnQuantity === expected
                ? {}
                : { differenceReason: current.differenceReason }),
            };
          }),
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
      await client.invalidateQueries({ queryKey: ['routes'] });
      await client.invalidateQueries({ queryKey: ['routes', detail.route.id] });
    },
  });
  if (detail.route.state !== 'RETURNED') return null;
  return (
    <Stack spacing={2} component="section" aria-label={t('routes.reconciliationLabel')}>
      <Typography variant="h6">{t('routes.reconciliationTitle')}</Typography>
      {(reconcile.error || close.error) && (
        <Alert severity="error">{localizedErrorMessage(reconcile.error ?? close.error, t)}</Alert>
      )}
      {!detail.reconciliation &&
        detail.load?.lines.map((line) => {
          const current = values[line.productId] ?? {
            physicalReturnQuantity:
              detail.balances.find((balance) => balance.productId === line.productId)?.quantity ??
              line.quantity,
            differenceReason: '',
          };
          const expected =
            detail.balances.find((balance) => balance.productId === line.productId)?.quantity ??
            line.quantity;
          const differs = current.physicalReturnQuantity !== expected;
          return (
            <Stack key={line.productId} direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                label={t('common.product')}
                value={line.productId}
                slotProps={{ input: { readOnly: true } }}
              />
              <TextField
                label={t('routes.physicalReturn', { expected })}
                value={current.physicalReturnQuantity}
                onChange={(event) =>
                  setValues((previous) => ({
                    ...previous,
                    [line.productId]: { ...current, physicalReturnQuantity: event.target.value },
                  }))
                }
              />
              <TextField
                label={t('routes.differenceReason')}
                required={differs}
                disabled={!differs}
                value={current.differenceReason}
                onChange={(event) =>
                  setValues((previous) => ({
                    ...previous,
                    [line.productId]: { ...current, differenceReason: event.target.value },
                  }))
                }
              />
            </Stack>
          );
        })}
      {!detail.reconciliation ? (
        <Button
          variant="contained"
          disabled={reconcile.isPending}
          onClick={() => reconcile.mutate()}
        >
          {t('routes.approveReconciliation')}
        </Button>
      ) : (
        <Button variant="contained" disabled={close.isPending} onClick={() => close.mutate()}>
          {t('routes.closeRoute')}
        </Button>
      )}
    </Stack>
  );
}

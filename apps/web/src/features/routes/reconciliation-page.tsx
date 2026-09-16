import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { idempotencyKey } from '../../lib/api/idempotency.js';
import { scaledQuantity } from '../inventory/inventory-quantity.js';
import type { RouteDetail, RouteResource } from './route-types.js';

interface ReturnValue {
  physicalReturnQuantity: string;
  differenceReason: string;
}

const returnQuantityPattern = /^\d+(?:\.\d{1,3})?$/;

function quantitiesMatch(actual: string, expected: string) {
  return returnQuantityPattern.test(actual) && scaledQuantity(actual) === scaledQuantity(expected);
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
              ...(quantitiesMatch(current.physicalReturnQuantity, expected)
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
          const differs = !quantitiesMatch(current.physicalReturnQuantity, expected);
          const productName =
            detail.balances.find((balance) => balance.productId === line.productId)?.productName ??
            line.productId;
          return (
            <Stack
              key={line.productId}
              component="fieldset"
              direction={{ xs: 'column', md: 'row' }}
              spacing={1}
              sx={{ minWidth: 0, border: 0, p: 0, m: 0 }}
            >
              <Typography component="legend">{productName}</Typography>
              <TextField
                label={t('common.product')}
                value={line.productId}
                slotProps={{ input: { readOnly: true } }}
              />
              <TextField
                label={t('routes.physicalReturn', { expected })}
                required
                slotProps={{
                  htmlInput: { inputMode: 'decimal', pattern: returnQuantityPattern.source },
                }}
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
                slotProps={{ htmlInput: { pattern: '.*\\S.*' } }}
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

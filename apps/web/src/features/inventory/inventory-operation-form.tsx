import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { completeIdempotentOperation, idempotencyKey } from '../../lib/api/idempotency.js';
import { ApiProblem } from '../../lib/api/problem.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

interface InventoryFormValues {
  operationType:
    | 'ENTRY'
    | 'MANUAL_EXIT'
    | 'POSITIVE_ADJUSTMENT'
    | 'NEGATIVE_ADJUSTMENT'
    | 'TRANSFER'
    | 'REVERSAL';
  branchId: string;
  destinationBranchId: string;
  originalOperationId: string;
  productId: string;
  quantity: string;
  reason: string;
}

export function InventoryOperationForm() {
  const { t } = useTranslation();
  const operationId = useFormId();
  const queryClient = useQueryClient();
  const form = useForm<InventoryFormValues>({
    defaultValues: {
      operationType: 'ENTRY',
      branchId: '',
      destinationBranchId: '',
      originalOperationId: '',
      productId: '',
      quantity: '',
      reason: '',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: InventoryFormValues) => {
      const path =
        values.operationType === 'TRANSFER'
          ? '/inventory/transfers'
          : values.operationType === 'REVERSAL'
            ? `/inventory/operations/${encodeURIComponent(values.originalOperationId)}/reversal`
            : '/inventory/operations';
      const body =
        values.operationType === 'TRANSFER'
          ? {
              sourceBranchId: values.branchId,
              destinationBranchId: values.destinationBranchId,
              reason: values.reason,
              lines: [{ productId: values.productId, quantity: values.quantity }],
            }
          : values.operationType === 'REVERSAL'
            ? { reason: values.reason }
            : {
                operationType: values.operationType,
                branchId: values.branchId,
                reason: values.reason,
                lines: [{ productId: values.productId, quantity: values.quantity }],
              };
      return apiRequest(path, {
        method: 'POST',
        idempotencyKey: idempotencyKey(operationId),
        body,
      });
    },
    onSuccess: async () => {
      completeIdempotentOperation(operationId);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
    },
  });
  const error = mutation.error ? localizedErrorMessage(mutation.error, t) : undefined;
  const operationType = form.watch('operationType');
  const isReversal = operationType === 'REVERSAL';
  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(event) => {
        void form.handleSubmit((values) => mutation.mutate(values))(event);
      }}
    >
      <Typography variant="h5">{t('inventory.recordOperation')}</Typography>
      {error && (
        <Alert
          severity={
            mutation.error instanceof ApiProblem && mutation.error.isConflict ? 'warning' : 'error'
          }
        >
          {error}
        </Alert>
      )}
      <TextField
        select
        label={t('inventory.operation')}
        {...form.register('operationType', { required: true })}
      >
        <MenuItem value="ENTRY">{t('operation.ENTRY')}</MenuItem>
        <MenuItem value="MANUAL_EXIT">{t('operation.MANUAL_EXIT')}</MenuItem>
        <MenuItem value="POSITIVE_ADJUSTMENT">{t('operation.POSITIVE_ADJUSTMENT')}</MenuItem>
        <MenuItem value="NEGATIVE_ADJUSTMENT">{t('operation.NEGATIVE_ADJUSTMENT')}</MenuItem>
        <MenuItem value="TRANSFER">{t('operation.TRANSFER')}</MenuItem>
        <MenuItem value="REVERSAL">{t('operation.REVERSAL')}</MenuItem>
      </TextField>
      {isReversal ? (
        <TextField
          label={t('inventory.originalOperationId')}
          {...form.register('originalOperationId', { required: true })}
        />
      ) : (
        <>
          <TextField
            label={
              operationType === 'TRANSFER' ? t('inventory.sourceBranchId') : t('inventory.branchId')
            }
            {...form.register('branchId', { required: true })}
          />
          {operationType === 'TRANSFER' && (
            <TextField
              label={t('inventory.destinationBranchId')}
              {...form.register('destinationBranchId', { required: true })}
            />
          )}
          <TextField
            label={t('common.productId')}
            {...form.register('productId', { required: true })}
          />
          <TextField
            label={t('common.quantity')}
            inputMode="decimal"
            {...form.register('quantity', { required: true, pattern: /^\d+(?:\.\d{1,3})?$/ })}
            error={Boolean(form.formState.errors.quantity)}
            helperText={form.formState.errors.quantity ? t('inventory.quantityHelp') : ''}
          />
        </>
      )}
      <TextField
        label={t('common.reason')}
        multiline
        {...form.register('reason', { required: true })}
      />
      <Button type="submit" variant="contained" disabled={mutation.isPending}>
        {t('inventory.confirmOperation')}
      </Button>
    </Stack>
  );
}

function useFormId(): string {
  return useRef(crypto.randomUUID()).current;
}

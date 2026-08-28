import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { apiRequest } from '../../lib/api/client.js';
import { completeIdempotentOperation, idempotencyKey } from '../../lib/api/idempotency.js';
import { ApiProblem } from '../../lib/api/problem.js';

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
  const error =
    mutation.error instanceof ApiProblem
      ? (mutation.error.problem.detail ?? mutation.error.problem.title)
      : mutation.error?.message;
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
      <Typography variant="h5">Record inventory operation</Typography>
      {error && (
        <Alert
          severity={
            mutation.error instanceof ApiProblem && mutation.error.isConflict ? 'warning' : 'error'
          }
        >
          {error}
        </Alert>
      )}
      <TextField select label="Operation" {...form.register('operationType', { required: true })}>
        <MenuItem value="ENTRY">Entry</MenuItem>
        <MenuItem value="MANUAL_EXIT">Manual exit</MenuItem>
        <MenuItem value="POSITIVE_ADJUSTMENT">Positive adjustment</MenuItem>
        <MenuItem value="NEGATIVE_ADJUSTMENT">Negative adjustment</MenuItem>
        <MenuItem value="TRANSFER">Transfer</MenuItem>
        <MenuItem value="REVERSAL">Reverse operation</MenuItem>
      </TextField>
      {isReversal ? (
        <TextField
          label="Original operation ID"
          {...form.register('originalOperationId', { required: true })}
        />
      ) : (
        <>
          <TextField
            label={operationType === 'TRANSFER' ? 'Source branch ID' : 'Branch ID'}
            {...form.register('branchId', { required: true })}
          />
          {operationType === 'TRANSFER' && (
            <TextField
              label="Destination branch ID"
              {...form.register('destinationBranchId', { required: true })}
            />
          )}
          <TextField label="Product ID" {...form.register('productId', { required: true })} />
          <TextField
            label="Quantity"
            inputMode="decimal"
            {...form.register('quantity', { required: true, pattern: /^\d+(?:\.\d{1,3})?$/ })}
            error={Boolean(form.formState.errors.quantity)}
            helperText={
              form.formState.errors.quantity ? 'Use a positive quantity with up to 3 decimals.' : ''
            }
          />
        </>
      )}
      <TextField label="Reason" multiline {...form.register('reason', { required: true })} />
      <Button type="submit" variant="contained" disabled={mutation.isPending}>
        Confirm operation
      </Button>
    </Stack>
  );
}

function useFormId(): string {
  return useRef(crypto.randomUUID()).current;
}

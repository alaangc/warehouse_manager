import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiRequest } from '../../lib/api/client.js';
import { idempotencyKey } from '../../lib/api/idempotency.js';
import { CustomerPicker, ProductPicker } from './customer-product-picker.js';
import { SaleResult } from './sale-result.js';

interface SaleValues {
  routeId: string;
  customerId: string;
  productId: string;
  quantity: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD';
}
interface Quote {
  total: string;
  currencyCode: string;
  lines: { unitPrice: string; lineAmount: string; available: boolean }[];
}

export function SaleForm() {
  const clientOperationId = useRef(crypto.randomUUID()).current;
  const [quote, setQuote] = useState<Quote | null>(null);
  const form = useForm<SaleValues>({
    defaultValues: {
      routeId: '',
      customerId: '',
      productId: '',
      quantity: '1',
      paymentMethod: 'CASH',
    },
  });
  const quoteMutation = useMutation({
    mutationFn: (values: SaleValues) =>
      apiRequest<{ data: Quote }>('/sales/quote', {
        method: 'POST',
        body: {
          customerId: values.customerId,
          routeId: values.routeId,
          lines: [{ productId: values.productId, quantity: values.quantity }],
        },
      }),
    onSuccess: (response) => setQuote(response.data),
  });
  const saleMutation = useMutation({
    mutationFn: (values: SaleValues) =>
      apiRequest<{ data: Record<string, unknown> }>('/sales', {
        method: 'POST',
        idempotencyKey: idempotencyKey(clientOperationId),
        body: {
          clientOperationId,
          customerId: values.customerId,
          routeId: values.routeId,
          paymentMethod: values.paymentMethod,
          lines: [{ productId: values.productId, quantity: values.quantity }],
        },
      }),
  });
  if (saleMutation.data) return <SaleResult sale={saleMutation.data.data} />;
  const values = form.watch();
  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(event) => {
        void form.handleSubmit((input) => saleMutation.mutate(input))(event);
      }}
    >
      <Typography variant="h4">New sale</Typography>
      {(quoteMutation.error || saleMutation.error) && (
        <Alert severity="error">{(quoteMutation.error ?? saleMutation.error)?.message}</Alert>
      )}
      <TextField label="Active route ID" {...form.register('routeId', { required: true })} />
      <CustomerPicker
        value={values.customerId}
        onChange={(id) => {
          form.setValue('customerId', id);
          setQuote(null);
        }}
      />
      <ProductPicker
        value={values.productId}
        onChange={(id) => {
          form.setValue('productId', id);
          setQuote(null);
        }}
      />
      <TextField
        label="Quantity"
        inputMode="decimal"
        {...form.register('quantity', { required: true, pattern: /^\d+(?:\.\d{1,3})?$/ })}
      />
      <TextField select label="Payment method" {...form.register('paymentMethod')}>
        <MenuItem value="CASH">Cash</MenuItem>
        <MenuItem value="BANK_TRANSFER">Bank transfer</MenuItem>
        <MenuItem value="CARD">Card</MenuItem>
      </TextField>
      <Button
        type="button"
        variant="outlined"
        onClick={() => quoteMutation.mutate(form.getValues())}
      >
        Refresh authoritative quote
      </Button>
      {quote && (
        <Alert severity={quote.lines.every((line) => line.available) ? 'info' : 'warning'}>
          Locked price: {quote.lines[0]?.unitPrice} — Total {quote.currencyCode} {quote.total}
        </Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={!quote || !quote.lines.every((line) => line.available) || saleMutation.isPending}
      >
        Confirm sale
      </Button>
    </Stack>
  );
}

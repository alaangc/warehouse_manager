import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { formatDecimal } from '../../i18n/format.js';
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
  const { t } = useTranslation();
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
      <Typography variant="h4">{t('sales.newSale')}</Typography>
      {(quoteMutation.error || saleMutation.error) && (
        <Alert severity="error">
          {localizedErrorMessage(quoteMutation.error ?? saleMutation.error, t)}
        </Alert>
      )}
      <TextField
        label={t('sales.activeRouteId')}
        {...form.register('routeId', { required: true })}
      />
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
        label={t('common.quantity')}
        inputMode="decimal"
        {...form.register('quantity', { required: true, pattern: /^\d+(?:\.\d{1,3})?$/ })}
      />
      <TextField select label={t('sales.paymentMethod')} {...form.register('paymentMethod')}>
        <MenuItem value="CASH">{t('sales.cash')}</MenuItem>
        <MenuItem value="BANK_TRANSFER">{t('sales.bankTransfer')}</MenuItem>
        <MenuItem value="CARD">{t('sales.card')}</MenuItem>
      </TextField>
      <Button
        type="button"
        variant="outlined"
        onClick={() => quoteMutation.mutate(form.getValues())}
      >
        {t('sales.refreshQuote')}
      </Button>
      {quote && (
        <Alert severity={quote.lines.every((line) => line.available) ? 'info' : 'warning'}>
          {t('sales.quote', {
            price: quote.lines[0]?.unitPrice ? formatDecimal(quote.lines[0].unitPrice) : '',
            currency: quote.currencyCode,
            total: formatDecimal(quote.total),
          })}
        </Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={!quote || !quote.lines.every((line) => line.available) || saleMutation.isPending}
      >
        {t('sales.confirmSale')}
      </Button>
    </Stack>
  );
}

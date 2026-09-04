import {
  Alert,
  Button,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import type { CustomerPrice } from './customer-types.js';

interface PriceValues {
  productId: string;
  unitPrice: string;
  validFrom: string;
}

function currentLocalDateTime(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CustomerPrices({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const prices = useQuery({
    queryKey: ['customers', customerId, 'prices'],
    queryFn: () => apiRequest<{ data: CustomerPrice[] }>(`/customers/${customerId}/prices`),
  });
  const form = useForm<PriceValues>({
    defaultValues: {
      productId: '',
      unitPrice: '',
      validFrom: currentLocalDateTime(),
    },
  });
  const create = useMutation({
    mutationFn: (values: PriceValues) =>
      apiRequest(`/customers/${customerId}/prices`, {
        method: 'POST',
        body: { ...values, validFrom: new Date(values.validFrom).toISOString() },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['customers', customerId, 'prices'] }),
  });
  const deactivate = useMutation({
    mutationFn: (priceId: string) =>
      apiRequest(`/customer-prices/${priceId}/deactivation`, {
        method: 'POST',
        body: { reason: 'Replaced or retired by administrator' },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['customers', customerId, 'prices'] }),
  });
  return (
    <Stack spacing={1}>
      <Typography variant="h6">{t('customers.specialPrices')}</Typography>
      {(prices.error || create.error || deactivate.error) && (
        <Alert severity="error">
          {localizedErrorMessage(prices.error ?? create.error ?? deactivate.error, t)}
        </Alert>
      )}
      <Stack
        component="form"
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        onSubmit={(event) => void form.handleSubmit((values) => create.mutate(values))(event)}
      >
        <TextField
          label={t('common.productId')}
          {...form.register('productId', { required: true })}
        />
        <TextField
          label={t('customers.exactUnitPrice')}
          {...form.register('unitPrice', { required: true, pattern: /^\d+(?:\.\d{1,4})?$/ })}
        />
        <TextField
          type="datetime-local"
          label={t('customers.validFrom')}
          {...form.register('validFrom', { required: true })}
        />
        <Button type="submit" variant="contained">
          {t('customers.addPrice')}
        </Button>
      </Stack>
      <List dense>
        {prices.data?.data.map((price) => (
          <ListItem
            key={price.id}
            secondaryAction={
              price.active ? (
                <Button onClick={() => deactivate.mutate(price.id)}>
                  {t('common.deactivate')}
                </Button>
              ) : null
            }
          >
            <ListItemText
              primary={`${price.productId} · ${formatDecimal(price.unitPrice)}`}
              secondary={`${price.active ? t('common.active') : t('common.inactive')} ${t('customers.from')} ${formatDateTime(price.validFrom)}`}
            />
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}

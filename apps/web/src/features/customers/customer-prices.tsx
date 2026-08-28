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
import { apiRequest } from '../../lib/api/client.js';
import type { CustomerPrice } from './customer-types.js';

interface PriceValues {
  productId: string;
  unitPrice: string;
  validFrom: string;
}

export function CustomerPrices({ customerId }: { customerId: string }) {
  const client = useQueryClient();
  const prices = useQuery({
    queryKey: ['customers', customerId, 'prices'],
    queryFn: () => apiRequest<{ data: CustomerPrice[] }>(`/customers/${customerId}/prices`),
  });
  const form = useForm<PriceValues>({
    defaultValues: {
      productId: '',
      unitPrice: '',
      validFrom: new Date().toISOString().slice(0, 16),
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
      <Typography variant="h6">Special prices</Typography>
      {(prices.error || create.error || deactivate.error) && (
        <Alert severity="error">
          {(prices.error ?? create.error ?? deactivate.error)?.message}
        </Alert>
      )}
      <Stack
        component="form"
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        onSubmit={(event) => void form.handleSubmit((values) => create.mutate(values))(event)}
      >
        <TextField label="Product ID" {...form.register('productId', { required: true })} />
        <TextField
          label="Exact unit price"
          {...form.register('unitPrice', { required: true, pattern: /^\d+(?:\.\d{1,4})?$/ })}
        />
        <TextField
          type="datetime-local"
          label="Valid from"
          {...form.register('validFrom', { required: true })}
        />
        <Button type="submit" variant="contained">
          Add price
        </Button>
      </Stack>
      <List dense>
        {prices.data?.data.map((price) => (
          <ListItem
            key={price.id}
            secondaryAction={
              price.active ? (
                <Button onClick={() => deactivate.mutate(price.id)}>Deactivate</Button>
              ) : null
            }
          >
            <ListItemText
              primary={`${price.productId} · ${price.unitPrice}`}
              secondary={`${price.active ? 'Active' : 'Inactive'} from ${price.validFrom}`}
            />
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}

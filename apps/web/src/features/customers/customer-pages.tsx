import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { CustomerForm } from './customer-form.js';
import { CustomerHistory } from './customer-history.js';
import { CustomerPrices } from './customer-prices.js';
import type { Customer } from './customer-types.js';

export function CustomerPages() {
  const { t } = useTranslation();
  const session = useSession();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const customers = useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      apiRequest<{ data: Customer[] }>(`/customers?search=${encodeURIComponent(search)}`),
  });
  const administrator = session.user?.role === 'ADMINISTRATOR';
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('customers.title')}</Typography>
      {customers.error && (
        <Alert severity="error">{localizedErrorMessage(customers.error, t)}</Alert>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          label={t('customers.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <TextField
          select
          label={t('customers.customer')}
          value={selected?.id ?? ''}
          onChange={(event) =>
            setSelected(customers.data?.data.find((item) => item.id === event.target.value) ?? null)
          }
        >
          {customers.data?.data.map((customer) => (
            <MenuItem key={customer.id} value={customer.id}>
              {customer.customerNumber} · {customer.displayName}
            </MenuItem>
          ))}
        </TextField>
        {administrator && (
          <Button
            onClick={() => {
              setSelected(null);
              setCreating(true);
            }}
          >
            {t('customers.newCustomer')}
          </Button>
        )}
      </Stack>
      {!administrator && selected && <Alert severity="info">{t('customers.driverReadOnly')}</Alert>}
      {administrator && (creating || selected) && (
        <CustomerForm
          {...(selected ? { customer: selected } : {})}
          onSaved={(customer) => {
            setSelected(customer);
            setCreating(false);
          }}
        />
      )}
      {administrator && selected && (
        <>
          <CustomerPrices customerId={selected.id} />
          <CustomerHistory customerId={selected.id} />
        </>
      )}
    </Stack>
  );
}

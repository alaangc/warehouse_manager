import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { CustomerForm } from './customer-form.js';
import { CustomerHistory } from './customer-history.js';
import { CustomerPrices } from './customer-prices.js';
import type { Customer } from './customer-types.js';

export function CustomerPages() {
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
      <Typography variant="h4">Customers</Typography>
      {customers.error && <Alert severity="error">{customers.error.message}</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          label="Search customers"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <TextField
          select
          label="Customer"
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
            New customer
          </Button>
        )}
      </Stack>
      {!administrator && selected && (
        <Alert severity="info">
          Driver access is read only. Select this customer while creating a sale.
        </Alert>
      )}
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

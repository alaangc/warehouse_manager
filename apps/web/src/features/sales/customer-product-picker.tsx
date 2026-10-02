import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Search, Store, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { useTranslation } from 'react-i18next';
import { useCustomerOptions, useProductOptions, type CustomerOption } from './sale-queries.js';

export function CustomerPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const customers = useCustomerOptions(search);
  const [lastSelected, setLastSelected] = useState<CustomerOption | null>(null);
  const options = customers.data?.data ?? [];
  const selected =
    options.find((customer) => customer.id === value) ??
    (lastSelected?.id === value ? lastSelected : null);
  const selectOptions =
    selected && !options.some((option) => option.id === selected.id)
      ? [selected, ...options]
      : options;
  function choose(id: string) {
    setLastSelected(selectOptions.find((customer) => customer.id === id) ?? null);
    onChange(id);
  }
  const matching = (customers.data?.data ?? []).filter((customer) =>
    `${customer.displayName} ${customer.customerNumber}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <Stack spacing={2}>
      <TextField
        label={t('ui.searchCustomers')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={20} />
              </InputAdornment>
            ),
          },
        }}
      />
      {customers.isLoading && <CircularProgress size={24} />}
      {customers.error && (
        <Alert severity="error">{localizedErrorMessage(customers.error, t)}</Alert>
      )}
      <TextField
        select
        label={t('customers.customer')}
        value={value}
        onChange={(event) => choose(event.target.value)}
      >
        {selectOptions.map((customer) => (
          <MenuItem key={customer.id} value={customer.id}>
            {customer.customerNumber} — {customer.displayName}
          </MenuItem>
        ))}
      </TextField>
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
        }}
      >
        {matching.slice(0, 8).map((customer) => (
          <ButtonBase
            key={customer.id}
            onClick={() => choose(customer.id)}
            aria-pressed={value === customer.id}
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: value === customer.id ? 'primary.main' : 'divider',
              bgcolor: value === customer.id ? '#f7f3ff' : 'background.paper',
              borderRadius: 2,
              textAlign: 'left',
              justifyContent: 'flex-start',
              gap: 1.5,
              minHeight: 84,
            }}
          >
            <Box
              sx={{
                p: 1.25,
                bgcolor: '#f0eaff',
                color: 'primary.main',
                borderRadius: 2,
                display: 'flex',
              }}
            >
              <Store size={23} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                {customer.displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {customer.customerNumber}
              </Typography>
            </Box>
            {value === customer.id && <CheckCircle2 size={22} color="#6020ee" />}
          </ButtonBase>
        ))}
      </Box>
      {!customers.isLoading && !customers.error && matching.length === 0 && (
        <Typography color="text.secondary">{t('ui.noResults')}</Typography>
      )}
      {selected && (
        <Chip
          sx={{ alignSelf: 'flex-start' }}
          color="success"
          label={`${t('ui.selected')}: ${selected.displayName}`}
        />
      )}
    </Stack>
  );
}

export function ProductPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const products = useProductOptions();
  return (
    <TextField
      select
      label={t('common.product')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {products.data?.data.map((product) => (
        <MenuItem key={product.id} value={product.id}>
          {product.sku} — {product.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

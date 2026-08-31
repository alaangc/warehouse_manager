import { MenuItem, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useCustomerOptions, useProductOptions } from './sale-queries.js';

export function CustomerPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const customers = useCustomerOptions();
  return (
    <TextField
      select
      label={t('customers.customer')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {customers.data?.data.map((customer) => (
        <MenuItem key={customer.id} value={customer.id}>
          {customer.customerNumber} — {customer.displayName}
        </MenuItem>
      ))}
    </TextField>
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

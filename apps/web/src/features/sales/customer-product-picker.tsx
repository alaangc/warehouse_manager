import { MenuItem, TextField } from '@mui/material';
import { useCustomerOptions, useProductOptions } from './sale-queries.js';

export function CustomerPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const customers = useCustomerOptions();
  return (
    <TextField
      select
      label="Customer"
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
  const products = useProductOptions();
  return (
    <TextField
      select
      label="Product"
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

import { Alert, Button, Stack, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { apiRequest } from '../../lib/api/client.js';

type SimpleCatalogKind = 'locations' | 'categories' | 'units' | 'vehicles';

interface SimpleCatalogValues {
  code: string;
  name: string;
  reportingGroup: 'OTHER';
  quantityScale: number;
  registration: string;
}

export function SimpleCatalogForm({ kind }: { kind: SimpleCatalogKind }) {
  const form = useForm<SimpleCatalogValues>({
    defaultValues: {
      code: '',
      name: '',
      reportingGroup: 'OTHER',
      quantityScale: 0,
      registration: '',
    },
  });
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: SimpleCatalogValues) => {
      const body =
        kind === 'categories'
          ? { name: values.name, reportingGroup: values.reportingGroup }
          : kind === 'units'
            ? { code: values.code, name: values.name, quantityScale: Number(values.quantityScale) }
            : kind === 'vehicles'
              ? { code: values.code, name: values.name, registration: values.registration || null }
              : { code: values.code, name: values.name };
      return apiRequest(`/${kind}`, { method: 'POST', body });
    },
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: [kind] });
    },
  });
  return (
    <Stack
      component="form"
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      onSubmit={(event) => {
        void form.handleSubmit((values) => mutation.mutate(values))(event);
      }}
    >
      {kind !== 'categories' && (
        <TextField label="Code" {...form.register('code', { required: true })} />
      )}
      <TextField label="Name" {...form.register('name', { required: true })} />
      {kind === 'units' && (
        <TextField
          label="Quantity decimals"
          type="number"
          slotProps={{ htmlInput: { min: 0, max: 3 } }}
          {...form.register('quantityScale', { valueAsNumber: true })}
        />
      )}
      {kind === 'vehicles' && <TextField label="Registration" {...form.register('registration')} />}
      <Button type="submit" variant="outlined" disabled={mutation.isPending}>
        Add
      </Button>
      {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
    </Stack>
  );
}

interface ProductFormValues {
  sku: string;
  name: string;
  categoryId: string;
  unitId: string;
  standardUnitPrice: string;
  lowStockThreshold: string;
  description: string;
}

export function ProductForm() {
  const form = useForm<ProductFormValues>({
    defaultValues: {
      sku: '',
      name: '',
      categoryId: '',
      unitId: '',
      standardUnitPrice: '',
      lowStockThreshold: '0',
      description: '',
    },
  });
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (values: ProductFormValues) =>
      apiRequest('/products', {
        method: 'POST',
        body: { ...values, description: values.description || null },
      }),
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(event) => {
        void form.handleSubmit((values) => mutation.mutate(values))(event);
      }}
    >
      {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
      <TextField label="SKU" {...form.register('sku', { required: true })} />
      <TextField label="Name" {...form.register('name', { required: true })} />
      <TextField label="Category ID" {...form.register('categoryId', { required: true })} />
      <TextField label="Unit ID" {...form.register('unitId', { required: true })} />
      <TextField
        label="Standard unit price"
        {...form.register('standardUnitPrice', { required: true, pattern: /^\d+(?:\.\d{1,4})?$/ })}
      />
      <TextField
        label="Low stock threshold"
        {...form.register('lowStockThreshold', { required: true, pattern: /^\d+(?:\.\d{1,3})?$/ })}
      />
      <TextField label="Description" multiline {...form.register('description')} />
      <Button type="submit" variant="contained" disabled={mutation.isPending}>
        Save product
      </Button>
    </Stack>
  );
}

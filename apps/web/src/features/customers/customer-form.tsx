import { Alert, Button, Stack, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { apiRequest } from '../../lib/api/client.js';
import type { Customer } from './customer-types.js';

interface Values {
  displayName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
  archiveReason: string;
}

export function CustomerForm({
  customer,
  onSaved,
}: {
  customer?: Customer;
  onSaved: (customer: Customer) => void;
}) {
  const client = useQueryClient();
  const form = useForm<Values>({
    defaultValues: {
      displayName: '',
      contactName: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      notes: '',
      archiveReason: '',
    },
  });
  useEffect(() => {
    form.reset({
      displayName: customer?.displayName ?? '',
      contactName: customer?.contactName ?? '',
      phone: customer?.phone ?? '',
      email: customer?.email ?? '',
      address: customer?.address ?? '',
      city: customer?.city ?? '',
      notes: customer?.notes ?? '',
      archiveReason: '',
    });
  }, [customer, form]);
  const save = useMutation({
    mutationFn: ({ values, active }: { values: Values; active: boolean }) => {
      const body = {
        displayName: values.displayName,
        contactName: values.contactName || null,
        phone: values.phone || null,
        email: values.email || null,
        address: values.address || null,
        city: values.city,
        notes: values.notes || null,
        ...(customer
          ? {
              expectedVersion: customer.version,
              active,
              ...(!active ? { reason: values.archiveReason } : {}),
            }
          : {}),
      };
      return apiRequest<{ data: Customer }>(customer ? `/customers/${customer.id}` : '/customers', {
        method: customer ? 'PATCH' : 'POST',
        body,
      });
    },
    onSuccess: async (response) => {
      onSaved(response.data);
      await client.invalidateQueries({ queryKey: ['customers'] });
    },
  });
  const submit = (active: boolean) =>
    form.handleSubmit((values) => {
      if (!active && !values.archiveReason.trim()) {
        form.setError('archiveReason', { message: 'An archive reason is required.' });
        return;
      }
      save.mutate({ values, active });
    });
  return (
    <Stack
      component="form"
      spacing={1}
      onSubmit={(event) => void submit(customer?.active ?? true)(event)}
    >
      {save.error && <Alert severity="error">{save.error.message}</Alert>}
      <TextField label="Customer name" {...form.register('displayName', { required: true })} />
      <TextField label="Contact name" {...form.register('contactName')} />
      <TextField label="Phone" {...form.register('phone')} />
      <TextField label="Email" type="email" {...form.register('email')} />
      <TextField label="Address" {...form.register('address')} />
      <TextField label="City" {...form.register('city', { required: true })} />
      <TextField label="Notes" multiline {...form.register('notes')} />
      {customer?.active && (
        <TextField
          label="Archive reason"
          error={Boolean(form.formState.errors.archiveReason)}
          helperText={form.formState.errors.archiveReason?.message}
          {...form.register('archiveReason')}
        />
      )}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={save.isPending}>
          {customer ? 'Save customer' : 'Create customer'}
        </Button>
        {customer?.active && (
          <Button type="button" color="warning" onClick={() => void submit(false)()}>
            Archive customer
          </Button>
        )}
        {customer && !customer.active && (
          <Button type="button" onClick={() => void submit(true)()}>
            Reactivate customer
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

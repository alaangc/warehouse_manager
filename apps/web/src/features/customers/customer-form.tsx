import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
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
  const { t } = useTranslation();
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
        form.setError('archiveReason', { message: t('customers.archiveReasonRequired') });
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
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {customer ? t('customers.editCustomer') : t('customers.newCustomer')}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {t('customers.customerFormHelp')}
        </Typography>
      </Box>
      {save.error && <Alert severity="error">{localizedErrorMessage(save.error, t)}</Alert>}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
        }}
      >
        <TextField
          label={t('customers.customerName')}
          {...form.register('displayName', { required: true })}
        />
        <TextField label={t('customers.contactName')} {...form.register('contactName')} />
        <TextField label={t('customers.phone')} {...form.register('phone')} />
        <TextField label={t('customers.email')} type="email" {...form.register('email')} />
        <TextField label={t('customers.address')} {...form.register('address')} />
        <TextField label={t('customers.city')} {...form.register('city', { required: true })} />
        <TextField
          label={t('customers.notes')}
          multiline
          minRows={2}
          sx={{ gridColumn: { sm: '1 / -1' } }}
          {...form.register('notes')}
        />
        {customer?.active && (
          <TextField
            label={t('customers.archiveReason')}
            error={Boolean(form.formState.errors.archiveReason)}
            helperText={form.formState.errors.archiveReason?.message}
            sx={{ gridColumn: { sm: '1 / -1' } }}
            {...form.register('archiveReason')}
          />
        )}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button type="submit" variant="contained" disabled={save.isPending}>
          {customer ? t('customers.saveCustomer') : t('customers.createCustomer')}
        </Button>
        {customer?.active && (
          <Button type="button" color="warning" onClick={() => void submit(false)()}>
            {t('customers.archiveCustomer')}
          </Button>
        )}
        {customer && !customer.active && (
          <Button type="button" onClick={() => void submit(true)()}>
            {t('customers.reactivateCustomer')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

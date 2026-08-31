import { Alert, Button, MenuItem, Stack, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

export type SimpleCatalogKind = 'locations' | 'categories' | 'units' | 'vehicles';
export type ReportingGroup = 'SODAS' | 'CHARCOAL' | 'TOSTADAS' | 'OTHER';

interface CatalogRecord {
  id: string;
  name: string;
  active: boolean;
  version: number;
}

export interface LocationRecord extends CatalogRecord {
  code: string;
}

export interface CategoryRecord extends CatalogRecord {
  reportingGroup: ReportingGroup;
}

export interface UnitRecord extends CatalogRecord {
  code: string;
  quantityScale: number;
}

export interface VehicleRecord extends CatalogRecord {
  code: string;
  registration: string | null;
}

export interface ProductRecord extends CatalogRecord {
  sku: string;
  description: string | null;
  categoryId: string;
  unitId: string;
  standardUnitPrice: string;
  lowStockThreshold: string;
}

export type SimpleCatalogRecord = LocationRecord | CategoryRecord | UnitRecord | VehicleRecord;

interface SimpleCatalogValues {
  code: string;
  name: string;
  reportingGroup: ReportingGroup;
  quantityScale: number;
  registration: string;
  archiveReason: string;
}

const simpleDefaults: SimpleCatalogValues = {
  code: '',
  name: '',
  reportingGroup: 'OTHER',
  quantityScale: 0,
  registration: '',
  archiveReason: '',
};

function simpleValues(record?: SimpleCatalogRecord): SimpleCatalogValues {
  if (!record) return simpleDefaults;
  return {
    code: 'code' in record ? record.code : '',
    name: record.name,
    reportingGroup: 'reportingGroup' in record ? record.reportingGroup : 'OTHER',
    quantityScale: 'quantityScale' in record ? record.quantityScale : 0,
    registration: 'registration' in record ? (record.registration ?? '') : '',
    archiveReason: '',
  };
}

function simpleBody(kind: SimpleCatalogKind, values: SimpleCatalogValues) {
  if (kind === 'categories') return { name: values.name, reportingGroup: values.reportingGroup };
  if (kind === 'units')
    return {
      code: values.code,
      name: values.name,
      quantityScale: Number(values.quantityScale),
    };
  if (kind === 'vehicles')
    return {
      code: values.code,
      name: values.name,
      registration: values.registration || null,
    };
  return { code: values.code, name: values.name };
}

export function SimpleCatalogForm({
  kind,
  record,
  onSaved,
}: {
  kind: SimpleCatalogKind;
  record?: SimpleCatalogRecord;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const form = useForm<SimpleCatalogValues>({ defaultValues: simpleValues(record) });
  const queryClient = useQueryClient();

  useEffect(() => {
    form.reset(simpleValues(record));
  }, [form, record]);

  const mutation = useMutation({
    mutationFn: ({ values, active }: { values: SimpleCatalogValues; active: boolean }) =>
      apiRequest(record ? `/${kind}/${record.id}` : `/${kind}`, {
        method: record ? 'PATCH' : 'POST',
        body: {
          ...simpleBody(kind, values),
          ...(record
            ? {
                expectedVersion: record.version,
                active,
                ...(record.active && !active ? { reason: values.archiveReason } : {}),
              }
            : {}),
        },
      }),
    onSuccess: async () => {
      if (!record) form.reset(simpleDefaults);
      onSaved?.();
      await queryClient.invalidateQueries({ queryKey: [kind] });
    },
  });

  const submit = (active: boolean) =>
    form.handleSubmit((values) => {
      if (record?.active && !active && !values.archiveReason.trim()) {
        form.setError('archiveReason', { message: t('catalog.archiveReasonRequired') });
        return;
      }
      mutation.mutate({ values, active });
    });

  return (
    <Stack
      component="form"
      aria-label={t('catalog.managementForm', { entity: t(`catalog.${kind}`) })}
      spacing={2}
      onSubmit={(event) => void submit(record?.active ?? true)(event)}
    >
      {mutation.error && <Alert severity="error">{localizedErrorMessage(mutation.error, t)}</Alert>}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {kind !== 'categories' && (
          <TextField
            label={t('catalog.code')}
            {...form.register('code', { required: t('catalog.requiredField') })}
          />
        )}
        <TextField
          label={t('common.name')}
          {...form.register('name', { required: t('catalog.requiredField') })}
        />
        {kind === 'categories' && (
          <Controller
            control={form.control}
            name="reportingGroup"
            render={({ field }) => (
              <TextField select label={t('catalog.reportingGroup')} {...field}>
                {(['SODAS', 'CHARCOAL', 'TOSTADAS', 'OTHER'] as const).map((group) => (
                  <MenuItem key={group} value={group}>
                    {t(`catalog.reportingGroups.${group}`)}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        )}
        {kind === 'units' && (
          <TextField
            label={t('catalog.quantityDecimals')}
            type="number"
            error={Boolean(form.formState.errors.quantityScale)}
            helperText={form.formState.errors.quantityScale?.message}
            slotProps={{ htmlInput: { min: 0, max: 3 } }}
            {...form.register('quantityScale', {
              valueAsNumber: true,
              min: { value: 0, message: t('catalog.quantityScaleRange') },
              max: { value: 3, message: t('catalog.quantityScaleRange') },
            })}
          />
        )}
        {kind === 'vehicles' && (
          <TextField label={t('catalog.registration')} {...form.register('registration')} />
        )}
      </Stack>
      {record?.active && (
        <TextField
          label={t('catalog.archiveReason')}
          error={Boolean(form.formState.errors.archiveReason)}
          helperText={form.formState.errors.archiveReason?.message}
          {...form.register('archiveReason')}
        />
      )}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {record ? t('catalog.saveChanges') : t('common.add')}
        </Button>
        {record?.active && (
          <Button
            type="button"
            color="warning"
            disabled={mutation.isPending}
            onClick={() => void submit(false)()}
          >
            {t('catalog.archiveRecord')}
          </Button>
        )}
        {record && !record.active && (
          <Button type="button" disabled={mutation.isPending} onClick={() => void submit(true)()}>
            {t('catalog.reactivateRecord')}
          </Button>
        )}
      </Stack>
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
  archiveReason: string;
}

function productValues(product?: ProductRecord): ProductFormValues {
  return {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? '',
    unitId: product?.unitId ?? '',
    standardUnitPrice: product?.standardUnitPrice ?? '',
    lowStockThreshold: product?.lowStockThreshold ?? '0',
    description: product?.description ?? '',
    archiveReason: '',
  };
}

export function ProductForm({
  product,
  categories,
  units,
  onSaved,
}: {
  product?: ProductRecord;
  categories?: CategoryRecord[];
  units?: UnitRecord[];
  onSaved?: (product: ProductRecord) => void;
} = {}) {
  const { t } = useTranslation();
  const form = useForm<ProductFormValues>({ defaultValues: productValues(product) });
  const queryClient = useQueryClient();

  useEffect(() => {
    form.reset(productValues(product));
  }, [form, product]);

  const mutation = useMutation({
    mutationFn: ({ values, active }: { values: ProductFormValues; active: boolean }) =>
      apiRequest<{ data: ProductRecord }>(product ? `/products/${product.id}` : '/products', {
        method: product ? 'PATCH' : 'POST',
        body: {
          sku: values.sku,
          name: values.name,
          description: values.description || null,
          categoryId: values.categoryId,
          unitId: values.unitId,
          standardUnitPrice: values.standardUnitPrice,
          lowStockThreshold: values.lowStockThreshold,
          ...(product
            ? {
                expectedVersion: product.version,
                active,
                ...(product.active && !active ? { reason: values.archiveReason } : {}),
              }
            : {}),
        },
      }),
    onSuccess: async (response) => {
      if (!product) form.reset(productValues());
      onSaved?.(response.data);
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const submit = (active: boolean) =>
    form.handleSubmit((values) => {
      if (product?.active && !active && !values.archiveReason.trim()) {
        form.setError('archiveReason', { message: t('catalog.archiveReasonRequired') });
        return;
      }
      mutation.mutate({ values, active });
    });

  return (
    <Stack
      component="form"
      aria-label={t('catalog.productForm')}
      spacing={2}
      onSubmit={(event) => void submit(product?.active ?? true)(event)}
    >
      {mutation.error && <Alert severity="error">{localizedErrorMessage(mutation.error, t)}</Alert>}
      <TextField
        label={t('catalog.sku')}
        {...form.register('sku', { required: t('catalog.requiredField') })}
      />
      <TextField
        label={t('common.name')}
        {...form.register('name', { required: t('catalog.requiredField') })}
      />
      {categories ? (
        <Controller
          control={form.control}
          name="categoryId"
          rules={{ required: t('catalog.requiredField') }}
          render={({ field }) => (
            <TextField select label={t('catalog.category')} {...field}>
              {categories
                .filter((category) => category.active || category.id === product?.categoryId)
                .map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
            </TextField>
          )}
        />
      ) : (
        <TextField
          label={t('catalog.categoryId')}
          {...form.register('categoryId', { required: t('catalog.requiredField') })}
        />
      )}
      {units ? (
        <Controller
          control={form.control}
          name="unitId"
          rules={{ required: t('catalog.requiredField') }}
          render={({ field }) => (
            <TextField select label={t('catalog.unit')} {...field}>
              {units
                .filter((unit) => unit.active || unit.id === product?.unitId)
                .map((unit) => (
                  <MenuItem key={unit.id} value={unit.id}>
                    {unit.code} — {unit.name}
                  </MenuItem>
                ))}
            </TextField>
          )}
        />
      ) : (
        <TextField
          label={t('catalog.unitId')}
          {...form.register('unitId', { required: t('catalog.requiredField') })}
        />
      )}
      <TextField
        label={t('catalog.standardUnitPrice')}
        error={Boolean(form.formState.errors.standardUnitPrice)}
        helperText={form.formState.errors.standardUnitPrice?.message}
        {...form.register('standardUnitPrice', {
          required: t('catalog.requiredField'),
          pattern: { value: /^\d+(?:\.\d{1,4})?$/, message: t('catalog.unitPriceFormat') },
        })}
      />
      <TextField
        label={t('catalog.lowStockThreshold')}
        error={Boolean(form.formState.errors.lowStockThreshold)}
        helperText={form.formState.errors.lowStockThreshold?.message}
        {...form.register('lowStockThreshold', {
          required: t('catalog.requiredField'),
          pattern: { value: /^\d+(?:\.\d{1,3})?$/, message: t('catalog.quantityFormat') },
        })}
      />
      <TextField label={t('common.description')} multiline {...form.register('description')} />
      {product?.active && (
        <TextField
          label={t('catalog.archiveReason')}
          error={Boolean(form.formState.errors.archiveReason)}
          helperText={form.formState.errors.archiveReason?.message}
          {...form.register('archiveReason')}
        />
      )}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {product ? t('catalog.saveChanges') : t('catalog.saveProduct')}
        </Button>
        {product?.active && (
          <Button
            type="button"
            color="warning"
            disabled={mutation.isPending}
            onClick={() => void submit(false)()}
          >
            {t('catalog.archiveRecord')}
          </Button>
        )}
        {product && !product.active && (
          <Button type="button" disabled={mutation.isPending} onClick={() => void submit(true)()}>
            {t('catalog.reactivateRecord')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

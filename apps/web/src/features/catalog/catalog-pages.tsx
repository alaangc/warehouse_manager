import {
  Alert,
  Button,
  CircularProgress,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { formatDecimal } from '../../i18n/format.js';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import {
  ProductForm,
  SimpleCatalogForm,
  type CategoryRecord,
  type ProductRecord,
  type SimpleCatalogKind,
  type SimpleCatalogRecord,
  type UnitRecord,
} from './catalog-forms.js';

function secondaryValue(
  kind: SimpleCatalogKind,
  record: SimpleCatalogRecord,
  t: (key: string) => string,
) {
  if (kind === 'categories' && 'reportingGroup' in record)
    return t(`catalog.reportingGroups.${record.reportingGroup}`);
  if (kind === 'units' && 'quantityScale' in record) return String(record.quantityScale);
  if (kind === 'vehicles' && 'registration' in record) return record.registration || '—';
  if ('code' in record) return record.code;
  return '—';
}

function SimpleCatalogSection({
  title,
  kind,
  records,
  selected,
  administrator,
  loading,
  error,
  onSelect,
}: {
  title: string;
  kind: SimpleCatalogKind;
  records: SimpleCatalogRecord[];
  selected?: SimpleCatalogRecord;
  administrator: boolean;
  loading: boolean;
  error: Error | null;
  onSelect: (record?: SimpleCatalogRecord) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">{title}</Typography>
        {administrator && selected && (
          <Button onClick={() => onSelect(undefined)}>{t('catalog.newRecord')}</Button>
        )}
      </Stack>
      {administrator && (
        <SimpleCatalogForm
          kind={kind}
          {...(selected ? { record: selected } : {})}
          onSaved={() => onSelect(undefined)}
        />
      )}
      {loading && <CircularProgress aria-label={t('common.loading')} />}
      {error && <Alert severity="error">{localizedErrorMessage(error, t)}</Alert>}
      <Table size="small" aria-label={title}>
        <TableHead>
          <TableRow>
            <TableCell>{t('common.name')}</TableCell>
            <TableCell>{t('catalog.identifier')}</TableCell>
            <TableCell>{t('common.status')}</TableCell>
            {administrator && <TableCell>{t('catalog.actions')}</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell>{record.name}</TableCell>
              <TableCell>{secondaryValue(kind, record, t)}</TableCell>
              <TableCell>{record.active ? t('common.active') : t('common.archived')}</TableCell>
              {administrator && (
                <TableCell>
                  <Button size="small" onClick={() => onSelect(record)}>
                    {t('catalog.editRecord')}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          {!loading && records.length === 0 && (
            <TableRow>
              <TableCell colSpan={administrator ? 4 : 3}>{t('catalog.noRecords')}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Stack>
  );
}

export function CatalogPages() {
  const { t } = useTranslation();
  const session = useSession();
  const administrator = session.user?.role === 'ADMINISTRATOR';
  const [productSearch, setProductSearch] = useState('');
  const [selectedByKind, setSelectedByKind] = useState<Partial<Record<SimpleCatalogKind, string>>>(
    {},
  );
  const [selectedProductId, setSelectedProductId] = useState<string>();

  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: () => apiRequest<{ data: SimpleCatalogRecord[] }>('/locations'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<{ data: CategoryRecord[] }>('/categories'),
  });
  const units = useQuery({
    queryKey: ['units'],
    queryFn: () => apiRequest<{ data: UnitRecord[] }>('/units'),
  });
  const vehicles = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => apiRequest<{ data: SimpleCatalogRecord[] }>('/vehicles'),
  });
  const products = useQuery({
    queryKey: ['products', productSearch],
    queryFn: () =>
      apiRequest<{ data: ProductRecord[] }>(
        productSearch ? `/products?search=${encodeURIComponent(productSearch)}` : '/products',
      ),
  });

  const selectSimple = (kind: SimpleCatalogKind, record?: SimpleCatalogRecord) => {
    setSelectedByKind((current) => ({ ...current, [kind]: record?.id }));
  };
  const simpleSections: Array<{
    kind: SimpleCatalogKind;
    title: string;
    query: typeof locations;
  }> = [
    { kind: 'locations', title: t('catalog.locations'), query: locations },
    { kind: 'categories', title: t('catalog.categories'), query: categories },
    { kind: 'units', title: t('catalog.units'), query: units },
    { kind: 'vehicles', title: t('catalog.vehicles'), query: vehicles },
  ];
  const productRows = products.data?.data ?? [];
  const selectedProduct = productRows.find((product) => product.id === selectedProductId);

  return (
    <Stack spacing={4}>
      <Typography variant="h4">{t('catalog.title')}</Typography>
      {!administrator && <Alert severity="info">{t('catalog.driverReadOnly')}</Alert>}
      {simpleSections.map(({ kind, title, query }, index) => {
        const records = query.data?.data ?? [];
        const selected = records.find((record) => record.id === selectedByKind[kind]);
        return (
          <Stack spacing={4} key={kind}>
            {index > 0 && <Divider />}
            <SimpleCatalogSection
              title={title}
              kind={kind}
              records={records}
              {...(selected ? { selected } : {})}
              administrator={administrator}
              loading={query.isLoading}
              error={query.error}
              onSelect={(record) => selectSimple(kind, record)}
            />
          </Stack>
        );
      })}
      <Divider />
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'space-between' }}
        >
          <Typography variant="h5">{t('catalog.products')}</Typography>
          <TextField
            label={t('catalog.searchProducts')}
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
          />
          {administrator && selectedProduct && (
            <Button onClick={() => setSelectedProductId(undefined)}>
              {t('catalog.newProduct')}
            </Button>
          )}
        </Stack>
        {administrator && (
          <ProductForm
            {...(selectedProduct ? { product: selectedProduct } : {})}
            categories={categories.data?.data ?? []}
            units={units.data?.data ?? []}
            onSaved={() => setSelectedProductId(undefined)}
          />
        )}
        {products.isLoading && <CircularProgress aria-label={t('common.loading')} />}
        {products.error && (
          <Alert severity="error">{localizedErrorMessage(products.error, t)}</Alert>
        )}
        <Table size="small" aria-label={t('catalog.products')}>
          <TableHead>
            <TableRow>
              <TableCell>{t('catalog.sku')}</TableCell>
              <TableCell>{t('common.name')}</TableCell>
              <TableCell>{t('catalog.price')}</TableCell>
              <TableCell>{t('common.status')}</TableCell>
              {administrator && <TableCell>{t('catalog.actions')}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {productRows.map((product) => (
              <TableRow key={product.id}>
                <TableCell>{product.sku}</TableCell>
                <TableCell>{product.name}</TableCell>
                <TableCell>{formatDecimal(product.standardUnitPrice)}</TableCell>
                <TableCell>{product.active ? t('common.active') : t('common.archived')}</TableCell>
                {administrator && (
                  <TableCell>
                    <Button size="small" onClick={() => setSelectedProductId(product.id)}>
                      {t('catalog.editRecord')}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!products.isLoading && productRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={administrator ? 5 : 4}>{t('catalog.noRecords')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Stack>
    </Stack>
  );
}

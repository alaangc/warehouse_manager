import {
  Alert,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { formatDecimal } from '../../i18n/format.js';
import { ProductForm, SimpleCatalogForm } from './catalog-forms.js';

interface Product {
  id: string;
  sku: string;
  name: string;
  standardUnitPrice: string;
  active: boolean;
}
export function CatalogPages() {
  const { t } = useTranslation();
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => apiRequest<{ data: Product[] }>('/products'),
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t('catalog.title')}</Typography>
      <Typography variant="h6">{t('catalog.locations')}</Typography>
      <SimpleCatalogForm kind="locations" />
      <Typography variant="h6">{t('catalog.categories')}</Typography>
      <SimpleCatalogForm kind="categories" />
      <Typography variant="h6">{t('catalog.units')}</Typography>
      <SimpleCatalogForm kind="units" />
      <Typography variant="h6">{t('catalog.vehicles')}</Typography>
      <SimpleCatalogForm kind="vehicles" />
      <Typography variant="h6">{t('catalog.products')}</Typography>
      <ProductForm />
      {products.isLoading && <CircularProgress />}
      {products.error && <Alert severity="error">{localizedErrorMessage(products.error, t)}</Alert>}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell>
            <TableCell>{t('common.name')}</TableCell>
            <TableCell>{t('catalog.price')}</TableCell>
            <TableCell>{t('common.status')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.data?.data.map((product) => (
            <TableRow key={product.id}>
              <TableCell>{product.sku}</TableCell>
              <TableCell>{product.name}</TableCell>
              <TableCell>{formatDecimal(product.standardUnitPrice)}</TableCell>
              <TableCell>{product.active ? t('common.active') : t('common.archived')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

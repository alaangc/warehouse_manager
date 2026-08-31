import { Alert, Button, Stack, Typography } from '@mui/material';
import { createBrowserRouter, useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout, PlaceholderPage } from './layout.js';
import { InventoryPage } from '../features/inventory/inventory-page.js';
import { ProductDetailPage } from '../features/inventory/product-detail-page.js';
import { CatalogPages } from '../features/catalog/catalog-pages.js';
import { InventoryOperationForm } from '../features/inventory/inventory-operation-form.js';
import { MovementHistory } from '../features/inventory/movement-history.js';
import { SaleForm } from '../features/sales/sale-form.js';
import { DriverSaleHistory } from '../features/sales/driver-sale-history.js';
import { RoutesPage } from '../features/routes/routes-page.js';
import { CustomerPages } from '../features/customers/customer-pages.js';
import { LoginPage } from '../features/auth/login-page.js';
import { SettingsPage } from '../features/settings/settings-page.js';

function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  return (
    <Stack spacing={2} sx={{ p: 3 }}>
      <Typography variant="h4">{t('common.error')}</Typography>
      <Alert severity="error">
        {error instanceof Error ? error.message : t('errors.pageLoad')}
      </Alert>
      <Button href="/">{t('common.returnHome')}</Button>
    </Stack>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <PlaceholderPage title="nav.overview" /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/products/:productId', element: <ProductDetailPage /> },
      { path: 'inventory/operations/new', element: <InventoryOperationForm /> },
      { path: 'inventory/movements', element: <MovementHistory /> },
      { path: 'catalog', element: <CatalogPages /> },
      { path: 'routes', element: <RoutesPage /> },
      { path: 'customers', element: <CustomerPages /> },
      { path: 'users', element: <PlaceholderPage title="nav.users" /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'sales', element: <DriverSaleHistory /> },
      { path: 'sales/new', element: <SaleForm /> },
    ],
  },
]);

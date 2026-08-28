import { Alert, Button, Stack, Typography } from '@mui/material';
import { createBrowserRouter, useRouteError } from 'react-router-dom';
import { AppLayout, PlaceholderPage } from './layout.js';
import { InventoryPage } from '../features/inventory/inventory-page.js';
import { CatalogPages } from '../features/catalog/catalog-pages.js';
import { InventoryOperationForm } from '../features/inventory/inventory-operation-form.js';
import { MovementHistory } from '../features/inventory/movement-history.js';
import { SaleForm } from '../features/sales/sale-form.js';
import { DriverSaleHistory } from '../features/sales/driver-sale-history.js';
import { RoutesPage } from '../features/routes/routes-page.js';
import { CustomerPages } from '../features/customers/customer-pages.js';

function RouteError() {
  const error = useRouteError();
  return (
    <Stack spacing={2} sx={{ p: 3 }}>
      <Typography variant="h4">Something went wrong</Typography>
      <Alert severity="error">
        {error instanceof Error ? error.message : 'The page could not be loaded.'}
      </Alert>
      <Button href="/">Return home</Button>
    </Stack>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <PlaceholderPage title="Overview" /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/operations/new', element: <InventoryOperationForm /> },
      { path: 'inventory/movements', element: <MovementHistory /> },
      { path: 'catalog', element: <CatalogPages /> },
      { path: 'routes', element: <RoutesPage /> },
      { path: 'customers', element: <CustomerPages /> },
      { path: 'users', element: <PlaceholderPage title="Users" /> },
      { path: 'sales', element: <DriverSaleHistory /> },
      { path: 'sales/new', element: <SaleForm /> },
    ],
  },
]);

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
import { apiRequest } from '../../lib/api/client.js';
import { ProductForm, SimpleCatalogForm } from './catalog-forms.js';

interface Product {
  id: string;
  sku: string;
  name: string;
  standardUnitPrice: string;
  active: boolean;
}
export function CatalogPages() {
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => apiRequest<{ data: Product[] }>('/products'),
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Product catalog</Typography>
      <Typography variant="h6">Locations</Typography>
      <SimpleCatalogForm kind="locations" />
      <Typography variant="h6">Categories</Typography>
      <SimpleCatalogForm kind="categories" />
      <Typography variant="h6">Units</Typography>
      <SimpleCatalogForm kind="units" />
      <Typography variant="h6">Vehicles</Typography>
      <SimpleCatalogForm kind="vehicles" />
      <Typography variant="h6">Products</Typography>
      <ProductForm />
      {products.isLoading && <CircularProgress />}
      {products.error && <Alert severity="error">{products.error.message}</Alert>}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Price</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.data?.data.map((product) => (
            <TableRow key={product.id}>
              <TableCell>{product.sku}</TableCell>
              <TableCell>{product.name}</TableCell>
              <TableCell>{product.standardUnitPrice}</TableCell>
              <TableCell>{product.active ? 'Active' : 'Archived'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

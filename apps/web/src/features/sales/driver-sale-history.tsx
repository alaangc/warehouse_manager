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
import { useSales } from './sale-queries.js';

export function DriverSaleHistory() {
  const sales = useSales();
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Sales</Typography>
      {sales.isLoading && <CircularProgress />}
      {sales.error && <Alert severity="error">{sales.error.message}</Alert>}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Sale</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sales.data?.data.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell>{new Date(sale.completed_at).toLocaleString()}</TableCell>
              <TableCell>{sale.sale_number}</TableCell>
              <TableCell>{sale.status}</TableCell>
              <TableCell>{sale.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

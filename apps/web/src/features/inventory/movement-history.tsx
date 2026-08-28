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
import { useInventoryMovements } from './inventory-queries.js';

export function MovementHistory({ routeId }: { routeId?: string }) {
  const movements = useInventoryMovements(routeId);
  return (
    <Stack spacing={2}>
      <Typography variant="h5">Movement history</Typography>
      {movements.isLoading && <CircularProgress />}
      {movements.error && <Alert severity="error">{movements.error.message}</Alert>}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Product</TableCell>
            <TableCell>Quantity</TableCell>
            <TableCell>Reason</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {movements.data?.data.map((movement) => (
            <TableRow key={movement.id}>
              <TableCell>{new Date(movement.occurred_at).toLocaleString()}</TableCell>
              <TableCell>{movement.operationType}</TableCell>
              <TableCell>{movement.product_id}</TableCell>
              <TableCell>{movement.quantity}</TableCell>
              <TableCell>{movement.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

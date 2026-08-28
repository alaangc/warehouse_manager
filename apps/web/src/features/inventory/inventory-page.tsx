import {
  Alert,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useInventoryBalances } from './inventory-queries.js';

export function InventoryPage() {
  const [alertsOnly, setAlertsOnly] = useState(false);
  const balances = useInventoryBalances({ alertsOnly });
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Inventory</Typography>
      <FormControlLabel
        control={<Switch checked={alertsOnly} onChange={(_, checked) => setAlertsOnly(checked)} />}
        label="Show low-stock alerts only"
      />
      {balances.isLoading && <CircularProgress aria-label="Loading inventory" />}
      {balances.error && <Alert severity="error">{balances.error.message}</Alert>}
      <Table aria-label="Inventory balances">
        <TableHead>
          <TableRow>
            <TableCell>Product</TableCell>
            <TableCell>Location</TableCell>
            <TableCell align="right">Quantity</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {balances.data?.data.map((balance) => (
            <TableRow key={balance.id}>
              <TableCell>{balance.productName}</TableCell>
              <TableCell>{balance.stockLocation.label}</TableCell>
              <TableCell align="right">{balance.quantity}</TableCell>
              <TableCell>
                {balance.lowStockAlert ? <Chip color="warning" label="Low stock" /> : 'Available'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

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
import { useTranslation } from 'react-i18next';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { formatDecimal } from '../../i18n/format.js';
import { useInventoryBalances } from './inventory-queries.js';

export function InventoryPage() {
  const { t } = useTranslation();
  const [alertsOnly, setAlertsOnly] = useState(false);
  const balances = useInventoryBalances({ alertsOnly });
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('inventory.title')}</Typography>
      <FormControlLabel
        control={<Switch checked={alertsOnly} onChange={(_, checked) => setAlertsOnly(checked)} />}
        label={t('inventory.showAlertsOnly')}
      />
      {balances.isLoading && <CircularProgress aria-label={t('inventory.loading')} />}
      {balances.error && <Alert severity="error">{localizedErrorMessage(balances.error, t)}</Alert>}
      <Table aria-label={t('inventory.balances')}>
        <TableHead>
          <TableRow>
            <TableCell>{t('common.product')}</TableCell>
            <TableCell>{t('inventory.location')}</TableCell>
            <TableCell align="right">{t('common.quantity')}</TableCell>
            <TableCell>{t('common.status')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {balances.data?.data.map((balance) => (
            <TableRow key={balance.id}>
              <TableCell>{balance.productName}</TableCell>
              <TableCell>{balance.stockLocation.label}</TableCell>
              <TableCell align="right">{formatDecimal(balance.quantity)}</TableCell>
              <TableCell>
                {balance.lowStockAlert ? (
                  <Chip color="warning" label={t('inventory.lowStock')} />
                ) : (
                  t('common.available')
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

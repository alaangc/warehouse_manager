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
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

export function DriverSaleHistory() {
  const { t } = useTranslation();
  const sales = useSales();
  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('sales.title')}</Typography>
      {sales.isLoading && <CircularProgress />}
      {sales.error && <Alert severity="error">{localizedErrorMessage(sales.error, t)}</Alert>}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>{t('common.date')}</TableCell>
            <TableCell>{t('sales.sale')}</TableCell>
            <TableCell>{t('common.status')}</TableCell>
            <TableCell>{t('common.total')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sales.data?.data.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell>{formatDateTime(sale.completedAt)}</TableCell>
              <TableCell>{sale.saleNumber}</TableCell>
              <TableCell>{t(`status.${sale.status}`, { defaultValue: sale.status })}</TableCell>
              <TableCell>{formatDecimal(sale.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

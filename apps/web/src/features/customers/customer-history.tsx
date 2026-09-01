import {
  Alert,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

interface SaleSummary {
  id: string;
  saleNumber: string;
  status: string;
  total: string;
  completedAt: string;
  paymentMethod?: string;
  routeId?: string;
}

export function CustomerHistory({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const history = useQuery({
    queryKey: ['customers', customerId, 'sales'],
    queryFn: () => apiRequest<{ data: SaleSummary[] }>(`/customers/${customerId}/sales`),
  });
  return (
    <section aria-label={t('customers.purchaseHistoryLabel')}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {t('customers.purchaseHistory')}
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
        {t('customers.purchaseHistoryHelp')}
      </Typography>
      {history.error && <Alert severity="error">{localizedErrorMessage(history.error, t)}</Alert>}
      {history.isLoading && <CircularProgress aria-label={t('customers.loadingHistory')} />}
      <TableContainer>
        <Table size="small" aria-label={t('customers.purchaseHistoryLabel')}>
          <TableHead>
            <TableRow>
              <TableCell>{t('common.date')}</TableCell>
              <TableCell>{t('sales.sale')}</TableCell>
              <TableCell>{t('common.status')}</TableCell>
              <TableCell align="right">{t('common.total')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {history.data?.data.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell>{formatDateTime(sale.completedAt)}</TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 650 }}>{sale.saleNumber}</Typography>
                  {sale.paymentMethod && (
                    <Typography color="text.secondary" variant="caption">
                      {t(`payment.${sale.paymentMethod}`, { defaultValue: sale.paymentMethod })}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    color={sale.status === 'COMPLETED' ? 'success' : 'default'}
                    label={t(`status.${sale.status}`, { defaultValue: sale.status })}
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">MXN {formatDecimal(sale.total)}</TableCell>
              </TableRow>
            ))}
            {!history.isLoading && (history.data?.data.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={4}>{t('customers.noPurchaseHistory')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </section>
  );
}

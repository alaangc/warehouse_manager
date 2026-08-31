import { Alert, List, ListItem, ListItemText, Typography } from '@mui/material';
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
}

export function CustomerHistory({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const history = useQuery({
    queryKey: ['customers', customerId, 'sales'],
    queryFn: () => apiRequest<{ data: SaleSummary[] }>(`/customers/${customerId}/sales`),
  });
  return (
    <section aria-label={t('customers.purchaseHistoryLabel')}>
      <Typography variant="h6">{t('customers.purchaseHistory')}</Typography>
      {history.error && <Alert severity="error">{localizedErrorMessage(history.error, t)}</Alert>}
      <List dense>
        {history.data?.data.map((sale) => (
          <ListItem key={sale.id}>
            <ListItemText
              primary={`${sale.saleNumber} · ${formatDecimal(sale.total)}`}
              secondary={`${t(`status.${sale.status}`, { defaultValue: sale.status })} · ${formatDateTime(sale.completedAt)}`}
            />
          </ListItem>
        ))}
      </List>
    </section>
  );
}

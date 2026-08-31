import { Alert, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { formatDecimal } from '../../i18n/format.js';

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function SaleResult({ sale }: { sale: Record<string, unknown> }) {
  const { t } = useTranslation();
  return (
    <Stack spacing={2}>
      <Alert severity="success">{t('sales.committed')}</Alert>
      <Typography variant="h4">{t('sales.ticket')}</Typography>
      <Typography>
        {t('sales.sale')}: {text(sale.saleNumber ?? sale.id)}
      </Typography>
      <Typography>
        {t('sales.ticketNumber')}: {text(sale.ticketNumber)}
      </Typography>
      <Typography>
        {t('common.total')}: {text(sale.currencyCode)} {formatDecimal(text(sale.total))}
      </Typography>
    </Stack>
  );
}

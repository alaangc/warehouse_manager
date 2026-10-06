import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { CircleCheck, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDecimal } from '../../i18n/format.js';
import { DocumentCenter } from '../documents/document-center.js';

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function SaleResult({
  sale,
  onNextSale,
}: {
  sale: Record<string, unknown>;
  onNextSale?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack spacing={3} sx={{ maxWidth: 720, mx: 'auto' }}>
      <Alert severity="success">{t('sales.committed')}</Alert>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
        <Box
          sx={{
            display: 'inline-flex',
            p: 2,
            borderRadius: '50%',
            bgcolor: '#def6ec',
            color: 'success.main',
            mb: 2,
          }}
        >
          <CircleCheck size={36} />
        </Box>
        <Typography variant="h4">{t('sales.ticket')}</Typography>
        <Typography>{text(sale.saleNumber ?? sale.id)}</Typography>
        {sale.ticketNumber !== sale.saleNumber && (
          <Typography>
            {t('sales.ticketNumber')}: {text(sale.ticketNumber)}
          </Typography>
        )}
        <Typography>
          {t('common.total')}: {text(sale.currencyCode)} {formatDecimal(text(sale.total))}
        </Typography>
      </Paper>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t('ui.ticketHelp')}
        </Typography>
        {typeof sale.id === 'string' && typeof sale.driverId === 'string' && (
          <DocumentCenter
            source={{
              documentType: 'TICKET',
              sourceType: 'SALE',
              sourceId: sale.id,
              sourceState: 'COMPLETED',
              driverId: sale.driverId,
            }}
          />
        )}
      </Paper>
      {onNextSale && (
        <Button size="large" variant="outlined" startIcon={<Plus size={20} />} onClick={onNextSale}>
          {t('ui.nextSale')}
        </Button>
      )}
    </Stack>
  );
}

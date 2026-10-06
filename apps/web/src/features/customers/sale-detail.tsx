import {
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { formatDecimal } from '../../i18n/format.js';
import { DocumentCenter } from '../documents/document-center.js';

interface SaleDetail {
  id: string;
  saleNumber: string;
  driverId: string;
  status: string;
  total: string;
  currencyCode: string;
  paymentMethod: string;
  lines: {
    sequence: number;
    productName: string;
    quantity: string;
    unitCode: string;
    unitPrice: string;
    lineAmount: string;
  }[];
}
export function SaleDetailDialog({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['sale-detail', saleId],
    queryFn: () => apiRequest<{ data: SaleDetail }>(`/sales/${saleId}`),
  });
  const sale = query.data?.data;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{sale?.saleNumber ?? t('credit.details')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {query.isLoading && <CircularProgress />}
          {query.error && <Alert severity="error">{t('credit.error')}</Alert>}
          {sale && (
            <>
              <Typography>
                {t(`payment.${sale.paymentMethod}`)} · {t(`status.${sale.status}`)}
              </Typography>
              {sale.lines.map((line) => (
                <Stack key={line.sequence}>
                  <Typography sx={{ fontWeight: 700 }}>{line.productName}</Typography>
                  <Typography>
                    {formatDecimal(line.quantity)} {line.unitCode} × {formatDecimal(line.unitPrice)}{' '}
                    USD
                  </Typography>
                  <Typography>{formatDecimal(line.lineAmount)} USD</Typography>
                </Stack>
              ))}
              <Typography variant="h6">
                {t('common.total')}: {formatDecimal(sale.total)} {sale.currencyCode}
              </Typography>
              <DocumentCenter
                source={{
                  documentType: 'TICKET',
                  sourceType: 'SALE',
                  sourceId: sale.id,
                  sourceState: sale.status,
                  driverId: sale.driverId,
                }}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}

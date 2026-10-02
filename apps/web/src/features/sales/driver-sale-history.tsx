import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Plus } from 'lucide-react';
import { useSession } from '../../app/session.js';
import { DocumentCenter } from '../documents/document-center.js';
import { useSales } from './sale-queries.js';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

export function DriverSaleHistory() {
  const { t } = useTranslation();
  const sales = useSales();
  const { user } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const selectedSale = sales.data?.data.find((sale) => sale.id === selected);
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="h4">{t('sales.title')}</Typography>
        <Button component={Link} to="/sales/new" startIcon={<Plus size={19} />} variant="contained">
          {t('sales.newSale')}
        </Button>
      </Stack>
      <Typography color="text.secondary">{t('ui.printHelp')}</Typography>
      {sales.isLoading && <CircularProgress />}
      {sales.error && <Alert severity="error">{localizedErrorMessage(sales.error, t)}</Alert>}
      {selectedSale && user && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">{selectedSale.saleNumber}</Typography>
              <Button onClick={() => setSelected(null)}>{t('common.close')}</Button>
            </Stack>
            <DocumentCenter
              source={{
                documentType: 'TICKET',
                sourceType: 'SALE',
                sourceId: selectedSale.id,
                sourceState: selectedSale.status,
                driverId: user.id,
              }}
            />
          </Stack>
        </Paper>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('common.date')}</TableCell>
              <TableCell>{t('sales.sale')}</TableCell>
              <TableCell>{t('common.status')}</TableCell>
              <TableCell>{t('common.total')}</TableCell>
              <TableCell>{t('sales.ticket')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sales.data?.data.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell>{formatDateTime(sale.completedAt)}</TableCell>
                <TableCell>{sale.saleNumber}</TableCell>
                <TableCell>{t(`status.${sale.status}`, { defaultValue: sale.status })}</TableCell>
                <TableCell>{formatDecimal(sale.total)}</TableCell>
                <TableCell>
                  <Button
                    startIcon={<Printer size={18} />}
                    onClick={() => setSelected(sale.id)}
                    variant="outlined"
                  >
                    {t('sales.ticket')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!sales.isLoading && !sales.error && sales.data?.data.length === 0 && (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">{t('ui.startSaleHelp')}</Typography>
        </Box>
      )}
    </Stack>
  );
}

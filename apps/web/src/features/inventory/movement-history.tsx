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
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

export function MovementHistory({ routeId }: { routeId?: string }) {
  const { t } = useTranslation();
  const movements = useInventoryMovements(routeId);
  return (
    <Stack spacing={2}>
      <Typography variant="h5">{t('inventory.movementHistory')}</Typography>
      {movements.isLoading && <CircularProgress />}
      {movements.error && (
        <Alert severity="error">{localizedErrorMessage(movements.error, t)}</Alert>
      )}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>{t('common.date')}</TableCell>
            <TableCell>{t('common.type')}</TableCell>
            <TableCell>{t('common.product')}</TableCell>
            <TableCell>{t('common.quantity')}</TableCell>
            <TableCell>{t('common.reason')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {movements.data?.data.map((movement) => (
            <TableRow key={movement.id}>
              <TableCell>{formatDateTime(movement.occurred_at)}</TableCell>
              <TableCell>
                {t(`operation.${movement.operationType}`, { defaultValue: movement.operationType })}
              </TableCell>
              <TableCell>{movement.product_id}</TableCell>
              <TableCell>{formatDecimal(movement.quantity)}</TableCell>
              <TableCell>{movement.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

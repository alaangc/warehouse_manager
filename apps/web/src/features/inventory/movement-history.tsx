import {
  Alert,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { useInventoryMovements } from './inventory-queries.js';

const operationTypes = [
  'ENTRY',
  'MANUAL_EXIT',
  'TRANSFER',
  'ROUTE_LOAD',
  'SALE',
  'ROUTE_RETURN',
  'POSITIVE_ADJUSTMENT',
  'NEGATIVE_ADJUSTMENT',
  'SALE_CANCELLATION',
] as const;

function instant(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function MovementHistory({ routeId }: { routeId?: string }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [productId, setProductId] = useState(() => searchParams.get('productId') ?? '');
  const [branchId, setBranchId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState(
    () => routeId ?? searchParams.get('routeId') ?? '',
  );
  const [operationType, setOperationType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filters = useMemo(() => {
    const fromInstant = instant(from);
    const toInstant = instant(to);
    return {
      ...(productId ? { productId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(selectedRouteId ? { routeId: selectedRouteId } : {}),
      ...(operationType ? { operationType } : {}),
      ...(fromInstant ? { from: fromInstant } : {}),
      ...(toInstant ? { to: toInstant } : {}),
    };
  }, [branchId, from, operationType, productId, selectedRouteId, to]);
  const movements = useInventoryMovements(filters);
  const rows = movements.data?.data ?? [];

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{t('inventory.movementHistory')}</Typography>
      <Alert severity="info">{t('inventory.immutableHistory')}</Alert>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          label={t('common.productId')}
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        />
        {!routeId && (
          <TextField
            label={t('inventory.branchId')}
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
          />
        )}
        <TextField
          label={t('inventory.routeId')}
          value={selectedRouteId}
          disabled={Boolean(routeId)}
          onChange={(event) => setSelectedRouteId(event.target.value)}
        />
        <TextField
          select
          label={t('inventory.movementType')}
          value={operationType}
          onChange={(event) => setOperationType(event.target.value)}
        >
          <MenuItem value="">{t('inventory.allMovementTypes')}</MenuItem>
          {operationTypes.map((type) => (
            <MenuItem key={type} value={type}>
              {t(`operation.${type}`, { defaultValue: type })}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('inventory.from')}
          type="datetime-local"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label={t('inventory.to')}
          type="datetime-local"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>
      {movements.isLoading && <CircularProgress aria-label={t('common.loading')} />}
      {movements.error && (
        <Alert severity="error">{localizedErrorMessage(movements.error, t)}</Alert>
      )}
      <TableContainer component={Paper}>
        <Table size="small" aria-label={t('inventory.movementHistory')} sx={{ minWidth: 1500 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('common.date')}</TableCell>
              <TableCell>{t('common.type')}</TableCell>
              <TableCell>{t('common.product')}</TableCell>
              <TableCell>{t('inventory.source')}</TableCell>
              <TableCell>{t('inventory.destination')}</TableCell>
              <TableCell align="right">{t('common.quantity')}</TableCell>
              <TableCell align="right">{t('inventory.sourceBalanceAfter')}</TableCell>
              <TableCell align="right">{t('inventory.destinationBalanceAfter')}</TableCell>
              <TableCell>{t('inventory.actor')}</TableCell>
              <TableCell>{t('common.reason')}</TableCell>
              <TableCell>{t('inventory.relatedRecord')}</TableCell>
              <TableCell>{t('inventory.reversesMovement')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                <TableCell>
                  {t(`operation.${movement.operationType}`, {
                    defaultValue: movement.operationType,
                  })}
                </TableCell>
                <TableCell>{movement.productId}</TableCell>
                <TableCell>{movement.source?.label ?? '—'}</TableCell>
                <TableCell>{movement.destination?.label ?? '—'}</TableCell>
                <TableCell align="right">{formatDecimal(movement.quantity)}</TableCell>
                <TableCell align="right">
                  {movement.sourceBalanceAfter === null
                    ? '—'
                    : formatDecimal(movement.sourceBalanceAfter)}
                </TableCell>
                <TableCell align="right">
                  {movement.destinationBalanceAfter === null
                    ? '—'
                    : formatDecimal(movement.destinationBalanceAfter)}
                </TableCell>
                <TableCell>{movement.actorId}</TableCell>
                <TableCell>{movement.reason ?? '—'}</TableCell>
                <TableCell>
                  {movement.relatedEntityType} · {movement.relatedEntityId}
                </TableCell>
                <TableCell>{movement.reversesMovementId ?? '—'}</TableCell>
              </TableRow>
            ))}
            {!movements.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12}>{t('inventory.noMovements')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

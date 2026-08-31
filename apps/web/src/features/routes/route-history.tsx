import { Chip, Divider, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import type { RouteDetail } from './route-types.js';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';

function value(record: Record<string, unknown>, camel: string, snake: string): string {
  const raw = record[camel] ?? record[snake];
  if (raw == null) return '—';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean')
    return String(raw);
  return JSON.stringify(raw);
}

export function RouteHistory({ detail }: { detail: RouteDetail }) {
  const { t } = useTranslation();
  return (
    <Stack spacing={2} aria-label={t('routes.historyLabel')}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="h6">{t('routes.history')}</Typography>
        {detail.route.state === 'CLOSED' && <Chip label={t('routes.readOnly')} color="default" />}
      </Stack>
      <Typography>
        {t('routes.load')}:{' '}
        {detail.load?.state
          ? t(`status.${detail.load.state}`, { defaultValue: detail.load.state })
          : t('routes.notRecorded')}{' '}
        · {t('routes.sales')}: {detail.sales.length} · {t('routes.movements')}:{' '}
        {detail.movements.length}
      </Typography>
      <List dense>
        {detail.movements.map((movement) => (
          <ListItem key={value(movement, 'id', 'id')} divider>
            <ListItemText
              primary={`${t(`operation.${value(movement, 'operationType', 'operation_type')}`, {
                defaultValue: value(movement, 'operationType', 'operation_type'),
              })} · ${formatDecimal(value(movement, 'quantity', 'quantity'))}`}
              secondary={formatDateTime(value(movement, 'occurredAt', 'occurred_at'))}
            />
          </ListItem>
        ))}
      </List>
      {detail.reconciliation && (
        <>
          <Divider />
          <Typography variant="subtitle1">{t('routes.approvedReconciliation')}</Typography>
          {detail.reconciliation.lines.map((line) => (
            <Typography key={line.productId} variant="body2">
              {t('routes.reconciliationLine', {
                productId: line.productId,
                loaded: formatDecimal(line.loadedQuantity),
                sold: formatDecimal(line.soldQuantity),
                returned: formatDecimal(line.physicalReturnQuantity),
                difference: formatDecimal(line.differenceQuantity),
              })}
              {line.differenceReason ? ` (${line.differenceReason})` : ''}
            </Typography>
          ))}
        </>
      )}
    </Stack>
  );
}

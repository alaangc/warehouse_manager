import { Box, Chip, List, ListItem, Paper, Stack, Typography } from '@mui/material';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import type { RouteDetail } from './route-types.js';

interface TimelineEntry {
  id: string;
  occurredAt: string;
  order: number;
  title: string;
  details: string[];
}

function value(record: Record<string, unknown>, camel: string, snake: string): string {
  const raw = record[camel] ?? record[snake];
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  return JSON.stringify(raw);
}

function routeTimeline(detail: RouteDetail, t: TFunction): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: `route-created-${detail.route.id}`,
      occurredAt: detail.route.createdAt,
      order: 0,
      title: t('routes.routeCreated'),
      details: [t('routes.createdBy', { actorId: detail.route.createdBy })],
    },
  ];

  if (detail.load?.confirmedAt) {
    entries.push({
      id: `load-confirmed-${detail.load.id}`,
      occurredAt: detail.load.confirmedAt,
      order: 10,
      title: t('routes.loadConfirmed'),
      details: detail.load.lines.map((line) =>
        t('routes.loadLine', {
          productId: line.productId,
          quantity: formatDecimal(line.quantity),
        }),
      ),
    });
  }

  if (detail.route.startedAt) {
    entries.push({
      id: `route-started-${detail.route.id}`,
      occurredAt: detail.route.startedAt,
      order: 30,
      title: t('routes.routeStarted'),
      details: [],
    });
  }

  for (const movement of detail.movements) {
    const operationType = value(movement, 'operationType', 'operation_type');
    const quantity = value(movement, 'quantity', 'quantity');
    const productId = value(movement, 'productId', 'product_id');
    const reason = value(movement, 'reason', 'reason');
    const occurredAt = value(movement, 'occurredAt', 'occurred_at');
    if (!occurredAt) continue;
    entries.push({
      id: `movement-${value(movement, 'id', 'id')}`,
      occurredAt,
      order: operationType === 'ROUTE_LOAD' ? 20 : operationType === 'SALE' ? 45 : 70,
      title: `${t(`operation.${operationType}`, { defaultValue: operationType })} · ${formatDecimal(quantity)}`,
      details: [
        ...(productId ? [t('routes.movementProduct', { productId })] : []),
        ...(reason ? [t('routes.movementReason', { reason })] : []),
      ],
    });
  }

  for (const sale of detail.sales) {
    entries.push({
      id: `sale-${sale.id}`,
      occurredAt: sale.completedAt,
      order: 40,
      title: t('routes.saleEvent', { saleNumber: sale.saleNumber }),
      details: [
        t('routes.saleSummary', {
          total: formatDecimal(sale.total),
          paymentMethod: t(`payment.${sale.paymentMethod}`, { defaultValue: sale.paymentMethod }),
          status: t(`status.${sale.status}`, { defaultValue: sale.status }),
        }),
        t('routes.saleCustomer', { customerId: sale.customerId }),
      ],
    });
  }

  if (detail.route.returnedAt) {
    entries.push({
      id: `route-returned-${detail.route.id}`,
      occurredAt: detail.route.returnedAt,
      order: 50,
      title: t('routes.routeReturned'),
      details: [],
    });
  }

  if (detail.reconciliation) {
    entries.push({
      id: `reconciliation-${detail.reconciliation.id}`,
      occurredAt: detail.reconciliation.approvedAt,
      order: 80,
      title: t('routes.reconciliationApproved'),
      details: detail.reconciliation.lines.map((line) => {
        const summary = t('routes.reconciliationLine', {
          productId: line.productId,
          loaded: formatDecimal(line.loadedQuantity),
          sold: formatDecimal(line.soldQuantity),
          returned: formatDecimal(line.physicalReturnQuantity),
          difference: formatDecimal(line.differenceQuantity),
        });
        return line.differenceReason ? `${summary} (${line.differenceReason})` : summary;
      }),
    });
  }

  if (detail.route.closedAt) {
    entries.push({
      id: `route-closed-${detail.route.id}`,
      occurredAt: detail.route.closedAt,
      order: 90,
      title: t('routes.routeClosed'),
      details: detail.route.closedBy
        ? [t('routes.closedBy', { actorId: detail.route.closedBy })]
        : [],
    });
  }

  return entries.sort((left, right) => {
    const timeDifference = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    return timeDifference || left.order - right.order || left.id.localeCompare(right.id);
  });
}

export function RouteHistory({ detail }: { detail: RouteDetail }) {
  const { t } = useTranslation();
  const timeline = routeTimeline(detail, t);

  return (
    <Stack component="section" spacing={2} aria-label={t('routes.historyLabel')}>
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
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {t('routes.timeline')}
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          {t('routes.timelineHelp')}
        </Typography>
        <List disablePadding aria-label={t('routes.timelineLabel')}>
          {timeline.map((entry, index) => (
            <ListItem key={entry.id} sx={{ alignItems: 'stretch', gap: 2, px: 0, py: 1.5 }}>
              <Stack sx={{ alignItems: 'center', width: 14 }} aria-hidden="true">
                <Box
                  sx={{
                    bgcolor:
                      entry.title === t('routes.routeClosed') ? 'success.main' : 'primary.main',
                    borderRadius: '50%',
                    flexShrink: 0,
                    height: 10,
                    mt: 0.7,
                    width: 10,
                  }}
                />
                {index < timeline.length - 1 && (
                  <Box sx={{ bgcolor: 'divider', flexGrow: 1, mt: 0.5, width: 2 }} />
                )}
              </Stack>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>{entry.title}</Typography>
                <Typography color="text.secondary" variant="caption">
                  {formatDateTime(entry.occurredAt)}
                </Typography>
                {entry.details.map((line, detailIndex) => (
                  <Typography
                    key={`${entry.id}-detail-${detailIndex}`}
                    color="text.secondary"
                    variant="body2"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {line}
                  </Typography>
                ))}
              </Box>
            </ListItem>
          ))}
        </List>
      </Paper>
    </Stack>
  );
}

import {
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime, formatDecimal } from '../../i18n/format.js';
import { scaledQuantity } from '../inventory/inventory-quantity.js';
import type { RouteDetail, RouteState } from './route-types.js';

const lifecycle: RouteState[] = ['PREPARING', 'EN_ROUTE', 'RETURNED', 'CLOSED'];

function statusTone(state: RouteState): 'default' | 'info' | 'warning' | 'success' {
  if (state === 'EN_ROUTE') return 'info';
  if (state === 'RETURNED') return 'warning';
  if (state === 'CLOSED') return 'success';
  return 'default';
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography color="text.secondary" component="dt" variant="caption">
        {label}
      </Typography>
      <Typography component="dd" sx={{ fontWeight: 650, m: 0, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 750 }}>
        {value}
      </Typography>
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
    </Paper>
  );
}

export function RouteOverview({ detail }: { detail: RouteDetail }) {
  const { t } = useTranslation();
  const { route, load, balances, sales, movements } = detail;
  const currentStep = lifecycle.indexOf(route.state);
  const stockedProducts = balances.filter(
    (balance) => scaledQuantity(balance.quantity) > 0n,
  ).length;
  const completedSales = sales.filter((sale) => sale.status === 'COMPLETED').length;

  return (
    <Stack spacing={3} component="section" aria-label={t('routes.overviewLabel')}>
      <Paper
        variant="outlined"
        sx={{
          background: 'linear-gradient(135deg, rgba(23, 74, 114, 0.08), rgba(77, 143, 202, 0.02))',
          p: { xs: 2.5, md: 3.5 },
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Box
              aria-hidden="true"
              sx={{
                alignItems: 'center',
                bgcolor: 'primary.main',
                borderRadius: 3,
                color: 'primary.contrastText',
                display: 'flex',
                fontSize: 28,
                height: 64,
                justifyContent: 'center',
                width: 64,
              }}
            >
              ↗
            </Box>
            <Box>
              <Typography component="h2" variant="h4" sx={{ fontWeight: 750 }}>
                {route.routeNumber}
              </Typography>
              <Typography color="text.secondary">
                {t('routes.businessDateValue', { date: formatDate(route.businessDate) })}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip
              color={statusTone(route.state)}
              label={t(`status.${route.state}`, { defaultValue: route.state })}
            />
            {route.state === 'CLOSED' && <Chip label={t('routes.readOnly')} />}
          </Stack>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, 1fr)' },
            mt: 3,
          }}
        >
          {lifecycle.map((state, index) => (
            <Box
              key={state}
              sx={{
                borderTop: 3,
                borderColor: index <= currentStep ? 'primary.main' : 'divider',
                pt: 1,
              }}
            >
              <Typography
                color={index <= currentStep ? 'primary.main' : 'text.secondary'}
                variant="caption"
                sx={{ fontWeight: index === currentStep ? 750 : 500 }}
              >
                {t(`status.${state}`, { defaultValue: state })}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, 1fr)' },
        }}
      >
        <Metric label={t('routes.loadedProductsShown')} value={load?.lines.length ?? 0} />
        <Metric label={t('routes.stockedProductsShown')} value={stockedProducts} />
        <Metric label={t('routes.completedSalesShown')} value={completedSales} />
        <Metric label={t('routes.movementsShown')} value={movements.length} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.4fr) minmax(280px, 0.7fr)' },
        }}
      >
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('routes.currentStock')}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t('routes.currentStockHelp')}
          </Typography>
          <TableContainer>
            <Table size="small" aria-label={t('routes.currentStock')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('common.product')}</TableCell>
                  <TableCell align="right">{t('common.quantity')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {balances.map((balance) => (
                  <TableRow key={balance.id}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 650 }}>{balance.productName}</Typography>
                      <Typography color="text.secondary" variant="caption">
                        {balance.productId}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatDecimal(balance.quantity)}</TableCell>
                  </TableRow>
                ))}
                {balances.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2}>{t('routes.noRouteStock')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            {t('routes.routeInformation')}
          </Typography>
          <Stack component="dl" divider={<Divider flexItem />} spacing={1.5} sx={{ m: 0 }}>
            <DetailItem
              label={t('routes.loadStatus')}
              value={
                load?.state
                  ? t(`status.${load.state}`, { defaultValue: load.state })
                  : t('routes.notRecorded')
              }
            />
            <DetailItem label={t('routes.originLocationId')} value={route.originLocationId} />
            <DetailItem label={t('routes.driverId')} value={route.driverId} />
            <DetailItem label={t('routes.vehicleId')} value={route.vehicleId} />
            <DetailItem
              label={t('routes.startedAt')}
              value={route.startedAt ? formatDateTime(route.startedAt) : '—'}
            />
            <DetailItem
              label={t('routes.returnedAt')}
              value={route.returnedAt ? formatDateTime(route.returnedAt) : '—'}
            />
            <DetailItem
              label={t('routes.closedAt')}
              value={route.closedAt ? formatDateTime(route.closedAt) : '—'}
            />
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}

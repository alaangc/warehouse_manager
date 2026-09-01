import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session.js';
import { formatDate } from '../../i18n/format.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { scaledQuantity } from '../inventory/inventory-quantity.js';
import { useInventoryBalances } from '../inventory/inventory-queries.js';
import { useRoutes } from '../routes/route-queries.js';
import type { RouteResource, RouteState } from '../routes/route-types.js';
import { useSales } from '../sales/sale-queries.js';

const routePriority: Record<RouteState, number> = {
  RETURNED: 0,
  EN_ROUTE: 1,
  PREPARING: 2,
  CLOSED: 3,
};

function routeTone(state: RouteState): 'default' | 'info' | 'warning' | 'success' {
  if (state === 'RETURNED') return 'warning';
  if (state === 'EN_ROUTE') return 'info';
  if (state === 'CLOSED') return 'success';
  return 'default';
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Paper variant="outlined" sx={{ borderTop: `4px solid ${tone}`, p: { xs: 2, md: 2.5 } }}>
      <Typography variant="h4" sx={{ color: tone, fontWeight: 750 }}>
        {value}
      </Typography>
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
    </Paper>
  );
}

function RouteCard({ route, balanceCount }: { route: RouteResource; balanceCount: number }) {
  const { t } = useTranslation();
  return (
    <Paper
      component={Link}
      to={`/routes?routeId=${encodeURIComponent(route.id)}`}
      variant="outlined"
      sx={{
        color: 'text.primary',
        display: 'block',
        p: 2.5,
        textDecoration: 'none',
        transition: 'border-color 120ms ease, transform 120ms ease',
        '&:hover': { borderColor: 'primary.main', transform: 'translateY(-1px)' },
      }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Box
          aria-hidden="true"
          sx={{
            alignItems: 'center',
            bgcolor: 'rgba(23, 74, 114, 0.08)',
            borderRadius: 2.5,
            color: 'primary.main',
            display: 'flex',
            fontSize: 24,
            height: 52,
            justifyContent: 'center',
            width: 52,
          }}
        >
          ↗
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {route.routeNumber}
            </Typography>
            <Chip
              color={routeTone(route.state)}
              label={t(`status.${route.state}`, { defaultValue: route.state })}
              size="small"
            />
          </Stack>
          <Typography color="text.secondary" variant="body2">
            {t('dashboard.businessDate', { date: formatDate(route.businessDate) })}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {t('dashboard.routeBalances', { count: balanceCount })}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const session = useSession();
  const administrator = session.user?.role === 'ADMINISTRATOR';
  const routes = useRoutes();
  const balances = useInventoryBalances();
  const sales = useSales({ enabled: !administrator });
  const routeRows = useMemo(() => routes.data?.data ?? [], [routes.data?.data]);
  const balanceRows = useMemo(() => balances.data?.data ?? [], [balances.data?.data]);
  const saleRows = sales.data?.data ?? [];
  const openRoutes = routeRows.filter((route) => route.state !== 'CLOSED');
  const displayedRoutes = [...(administrator ? openRoutes : routeRows)]
    .sort(
      (left, right) =>
        routePriority[left.state] - routePriority[right.state] ||
        right.businessDate.localeCompare(left.businessDate),
    )
    .slice(0, 4);
  const productsShown = new Set(balanceRows.map((balance) => balance.productId)).size;
  const productsAvailable = new Set(
    balanceRows
      .filter((balance) => scaledQuantity(balance.quantity) > 0n)
      .map((balance) => balance.productId),
  ).size;
  const metrics = administrator
    ? [
        { label: t('dashboard.openRoutes'), value: openRoutes.length, tone: '#2b6cb0' },
        {
          label: t('dashboard.returnedRoutes'),
          value: routeRows.filter((route) => route.state === 'RETURNED').length,
          tone: '#805ad5',
        },
        {
          label: t('dashboard.lowStockShown'),
          value: balanceRows.filter((balance) => balance.lowStockAlert).length,
          tone: '#d97706',
        },
        { label: t('dashboard.productsShown'), value: productsShown, tone: '#2f855a' },
      ]
    : [
        {
          label: t('dashboard.routesEnRoute'),
          value: routeRows.filter((route) => route.state === 'EN_ROUTE').length,
          tone: '#2b6cb0',
        },
        {
          label: t('dashboard.routesPreparing'),
          value: routeRows.filter((route) => route.state === 'PREPARING').length,
          tone: '#805ad5',
        },
        {
          label: t('dashboard.completedSalesShown'),
          value: saleRows.filter((sale) => sale.status === 'COMPLETED').length,
          tone: '#2f855a',
        },
        { label: t('dashboard.productsAvailable'), value: productsAvailable, tone: '#d97706' },
      ];
  const error = routes.error ?? balances.error ?? sales.error;
  const activeDriverRoute = routeRows.some((route) => route.state === 'EN_ROUTE');

  return (
    <Stack spacing={3.5}>
      <Paper
        variant="outlined"
        sx={{
          background: 'linear-gradient(135deg, rgba(23, 74, 114, 0.08), rgba(77, 143, 202, 0.02))',
          overflow: 'hidden',
          p: { xs: 2.5, md: 4 },
          position: 'relative',
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            bgcolor: 'rgba(77, 143, 202, 0.08)',
            borderRadius: '50%',
            height: 220,
            position: 'absolute',
            right: -70,
            top: -110,
            width: 220,
          }}
        />
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', position: 'relative' }}>
          <Box
            component="img"
            src="/stock-control-logo.png"
            alt=""
            aria-hidden="true"
            sx={{ height: { xs: 62, sm: 78 }, objectFit: 'contain', width: { xs: 62, sm: 78 } }}
          />
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 750 }}>
              {t('dashboard.greeting', { name: session.user?.displayName ?? '' })}
            </Typography>
            <Typography color="text.secondary">
              {administrator ? t('dashboard.adminDescription') : t('dashboard.driverDescription')}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{localizedErrorMessage(error, t)}</Alert>}
      {(routes.isLoading || balances.isLoading || sales.isLoading) && (
        <CircularProgress aria-label={t('dashboard.loading')} />
      )}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(4, minmax(0, 1fr))',
          },
        }}
      >
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.7fr) minmax(260px, 0.7fr)' },
        }}
      >
        <Stack spacing={1.5}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {administrator ? t('dashboard.routesToReview') : t('dashboard.assignedRoutes')}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {administrator
                  ? t('dashboard.routesToReviewHelp')
                  : t('dashboard.assignedRoutesHelp')}
              </Typography>
            </Box>
            <Button component={Link} to="/routes">
              {t('dashboard.viewRoutes')}
            </Button>
          </Stack>
          {displayedRoutes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              balanceCount={
                balanceRows.filter((balance) => balance.stockLocation.routeId === route.id).length
              }
            />
          ))}
          {!routes.isLoading && displayedRoutes.length === 0 && (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography color="text.secondary">
                {administrator ? t('dashboard.noOpenRoutes') : t('dashboard.noAssignedRoutes')}
              </Typography>
            </Paper>
          )}
        </Stack>

        <Paper variant="outlined" sx={{ alignSelf: 'start', p: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('dashboard.quickActions')}
          </Typography>
          <Stack spacing={1.25} sx={{ mt: 2 }}>
            {administrator ? (
              <>
                <Button component={Link} to="/inventory/operations/new" variant="contained">
                  {t('inventory.recordOperation')}
                </Button>
                <Button component={Link} to="/routes" variant="outlined">
                  {t('dashboard.manageRoutes')}
                </Button>
                <Button component={Link} to="/catalog" variant="outlined">
                  {t('inventory.openCatalog')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  component={Link}
                  disabled={!activeDriverRoute}
                  to="/sales/new"
                  variant="contained"
                >
                  {t('sales.newSale')}
                </Button>
                {!activeDriverRoute && (
                  <Typography color="text.secondary" variant="caption">
                    {t('dashboard.saleRequiresActiveRoute')}
                  </Typography>
                )}
                <Button component={Link} to="/routes" variant="outlined">
                  {t('nav.myRoute')}
                </Button>
                <Button component={Link} to="/sales" variant="outlined">
                  {t('nav.mySales')}
                </Button>
              </>
            )}
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}

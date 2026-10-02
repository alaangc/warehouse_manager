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
import {
  ArrowRight,
  Truck,
  ShoppingCart,
  ReceiptText,
  Package,
  TriangleAlert,
  CircleCheck,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session.js';
import { formatDate } from '../../i18n/format.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { scaledQuantity } from '../inventory/inventory-quantity.js';
import { useInventoryBalances } from '../inventory/inventory-queries.js';
import { useRoutes } from '../routes/route-queries.js';
import { useSales } from '../sales/sale-queries.js';
import type { RouteState } from '../routes/route-types.js';

const priority: Record<RouteState, number> = { RETURNED: 0, EN_ROUTE: 1, PREPARING: 2, CLOSED: 3 };

export function DashboardPage({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const administrator = user?.role === 'ADMINISTRATOR';
  const routes = useRoutes('active');
  const balances = useInventoryBalances();
  const sales = useSales({ enabled: !administrator });
  const routeRows = routes.data?.data ?? [];
  const balanceRows = balances.data?.data ?? [];
  const openRoutes = routeRows.filter((route) => route.state !== 'CLOSED');
  const displayedRoutes = [...openRoutes]
    .sort(
      (a, b) =>
        priority[a.state] - priority[b.state] || b.businessDate.localeCompare(a.businessDate),
    )
    .slice(0, 4);
  const active = routeRows.some((route) => route.state === 'EN_ROUTE');
  const metrics = administrator
    ? [
        { label: 'dashboard.openRoutes', value: openRoutes.length, icon: Truck, color: '#1762ef' },
        {
          label: 'dashboard.returnedRoutes',
          value: routeRows.filter((route) => route.state === 'RETURNED').length,
          icon: CircleCheck,
          color: '#147d58',
        },
        {
          label: 'dashboard.lowStockShown',
          value: balanceRows.filter((balance) => balance.lowStockAlert).length,
          icon: TriangleAlert,
          color: '#976000',
        },
        {
          label: 'dashboard.productsShown',
          value: new Set(balanceRows.map((balance) => balance.productId)).size,
          icon: Package,
          color: '#6020ee',
        },
      ]
    : [
        {
          label: 'dashboard.routesEnRoute',
          value: routeRows.filter((route) => route.state === 'EN_ROUTE').length,
          icon: Truck,
          color: '#1762ef',
        },
        {
          label: 'dashboard.routesPreparing',
          value: routeRows.filter((route) => route.state === 'PREPARING').length,
          icon: Package,
          color: '#6020ee',
        },
        {
          label: 'dashboard.completedSalesShown',
          value: (sales.data?.data ?? []).filter((sale) => sale.status === 'COMPLETED').length,
          icon: ReceiptText,
          color: '#147d58',
        },
        {
          label: 'dashboard.productsAvailable',
          value: new Set(
            balanceRows
              .filter((balance) => scaledQuantity(balance.quantity) > 0n)
              .map((balance) => balance.productId),
          ).size,
          icon: Package,
          color: '#976000',
        },
      ];
  const error = routes.error ?? balances.error ?? sales.error;
  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box
          component="img"
          src="/stock-control-logo.png"
          alt=""
          sx={{ height: 58, width: 58, objectFit: 'contain' }}
        />
        <Box>
          <Typography component="h1" variant="h4">
            {t('dashboard.greeting', { name: user?.displayName ?? '' })}
          </Typography>
          <Typography color="text.secondary">
            {t(administrator ? 'dashboard.adminDescription' : 'dashboard.driverDescription')}
          </Typography>
        </Box>
      </Stack>
      {error && <Alert severity="error">{localizedErrorMessage(error, t)}</Alert>}
      {(routes.isLoading || balances.isLoading || sales.isLoading) && (
        <CircularProgress aria-label={t('dashboard.loading')} />
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 3, bgcolor: '#f0eaff', borderColor: '#ded1ff' }}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center', mb: 1, color: 'primary.main' }}
          >
            {administrator ? <Truck size={27} /> : <ShoppingCart size={27} />}
            <Typography variant="h5" color="text.primary">
              {t(administrator ? 'dashboard.manageRoutes' : 'ui.startSale')}
            </Typography>
          </Stack>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t(administrator ? 'ui.adminHelp' : 'ui.startSaleHelp')}
          </Typography>
          <Button
            component={Link}
            to={administrator ? '/routes' : '/sales/new'}
            disabled={!administrator && !active}
            variant="contained"
            size="large"
            endIcon={<ArrowRight size={20} />}
          >
            {t(administrator ? 'dashboard.manageRoutes' : 'sales.newSale')}
          </Button>
          {!administrator && !active && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t('dashboard.saleRequiresActiveRoute')}
            </Typography>
          )}
        </Paper>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center', mb: 1, color: 'secondary.main' }}
          >
            {administrator ? <Package size={27} /> : <ReceiptText size={27} />}
            <Typography variant="h5" color="text.primary">
              {t(administrator ? 'nav.inventory' : 'ui.tickets')}
            </Typography>
          </Stack>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t(administrator ? 'inventory.overviewDescription' : 'ui.printHelp')}
          </Typography>
          <Button
            component={Link}
            to={administrator ? '/inventory' : '/sales'}
            variant="outlined"
            endIcon={<ArrowRight size={19} />}
          >
            {t(administrator ? 'nav.inventory' : 'nav.mySales')}
          </Button>
        </Paper>
      </Box>
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t('ui.summary')}
        </Typography>
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
          {metrics.map(({ label, value, icon: Icon, color }) => (
            <Box key={label} sx={{ textAlign: 'center', py: 1 }}>
              <Box
                sx={{
                  display: 'inline-flex',
                  color,
                  bgcolor: `${color}12`,
                  p: 1.25,
                  borderRadius: 2,
                  mb: 1,
                }}
              >
                <Icon size={24} />
              </Box>
              <Typography variant="h5">{value}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t(label)}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography variant="h5">
            {t(administrator ? 'dashboard.routesToReview' : 'dashboard.assignedRoutes')}
          </Typography>
          <Button component={Link} to="/routes" endIcon={<ArrowRight size={18} />}>
            {t('dashboard.viewRoutes')}
          </Button>
        </Stack>
        {displayedRoutes.map((route) => (
          <Paper
            key={route.id}
            component={Link}
            to={`/routes?routeId=${encodeURIComponent(route.id)}`}
            variant="outlined"
            sx={{
              p: 2.5,
              color: 'text.primary',
              textDecoration: 'none',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  display: 'flex',
                  p: 1.5,
                  bgcolor: '#edf3ff',
                  color: 'secondary.main',
                  borderRadius: '50%',
                }}
              >
                <Truck size={25} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6">{route.routeNumber}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.businessDate', { date: formatDate(route.businessDate) })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard.routeBalances', {
                    count: balanceRows.filter(
                      (balance) => balance.stockLocation.routeId === route.id,
                    ).length,
                  })}
                </Typography>
              </Box>
              <Chip
                size="small"
                color={
                  route.state === 'RETURNED'
                    ? 'warning'
                    : route.state === 'EN_ROUTE' || route.state === 'CLOSED'
                      ? 'success'
                      : 'default'
                }
                label={t(`status.${route.state}`)}
              />
              <ArrowRight size={18} />
            </Stack>
          </Paper>
        ))}
        {!routes.isLoading && displayedRoutes.length === 0 && (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography color="text.secondary">
              {t(administrator ? 'dashboard.noOpenRoutes' : 'dashboard.noAssignedRoutes')}
            </Typography>
          </Paper>
        )}
      </Stack>
      {administrator && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={Link} to="/inventory/operations/new" variant="outlined">
            {t('inventory.recordOperation')}
          </Button>
          <Button component={Link} to="/catalog">
            {t('inventory.openCatalog')}
          </Button>
        </Stack>
      )}
      {children && (
        <Box component="details">
          <Box component="summary" sx={{ cursor: 'pointer', py: 2, color: 'text.secondary' }}>
            {t('printers.overview')}
          </Box>
          {children}
        </Box>
      )}
    </Stack>
  );
}

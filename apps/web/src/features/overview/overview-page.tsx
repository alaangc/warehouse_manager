import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { OverviewResourceSchema } from '@warehouse/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { DashboardPage } from '../dashboard/dashboard-page.js';

const actions: Record<string, string> = {
  '/inventory': 'nav.inventory',
  '/routes': 'nav.routes',
  '/customers': 'nav.customers',
  '/cash-closes': 'reports.cashCloses',
  '/reports': 'reports.title',
  '/users': 'nav.users',
  '/settings': 'nav.settings',
  '/sales/new': 'nav.newSale',
  '/sales': 'nav.mySales',
};
export function RoleOverviewPanel() {
  const { user } = useSession();
  const { t } = useTranslation();
  const overview = useQuery({
    queryKey: ['role-overview', user?.id, user?.role],
    enabled: Boolean(user),
    queryFn: async () =>
      OverviewResourceSchema.parse((await apiRequest<{ data: unknown }>('/overview')).data),
  });
  if (!user) return null;
  if (overview.isPending) return <CircularProgress aria-label={t('dashboard.loading')} />;
  if (overview.error)
    return (
      <Alert
        severity="error"
        action={
          <Button onClick={() => void overview.refetch()}>{t('administration.retry')}</Button>
        }
      >
        {localizedErrorMessage(overview.error, t)}
      </Alert>
    );
  const data = overview.data;
  if (!data) return null;
  const administrator = user.role === 'ADMINISTRATOR';
  const allowed = administrator
    ? Object.keys(actions)
    : ['/sales/new', '/routes', '/sales', '/settings'];
  return (
    <Paper
      component="section"
      aria-label={t('printers.overview')}
      variant="outlined"
      sx={{ p: 2.5 }}
    >
      <Stack spacing={2}>
        {administrator && 'grossTotal' in data && (
          <Box>
            <Typography>
              {t('printers.grossAllTime')}: <b>{data.grossTotal}</b>
            </Typography>
            <Typography>
              {t('printers.lowStockTotal')}: <b>{data.lowStockCount}</b>
            </Typography>
          </Box>
        )}
        <Typography>
          {t(administrator ? 'dashboard.openRoutes' : 'dashboard.assignedRoutes')}:{' '}
          {data.routes.length}
        </Typography>
        <Typography variant="subtitle2">{t('printers.availableActions')}</Typography>
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
          {data.actions
            .filter((path) => allowed.includes(path))
            .map((path) => (
              <Button
                key={path}
                component={Link}
                to={path}
                disabled={
                  path === '/sales/new' && !data.routes.some((route) => route.state === 'EN_ROUTE')
                }
              >
                {t(actions[path]!)}
              </Button>
            ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
export function OverviewPage() {
  return (
    <DashboardPage>
      <RoleOverviewPanel />
    </DashboardPage>
  );
}

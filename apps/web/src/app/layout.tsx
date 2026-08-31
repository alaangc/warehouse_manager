import {
  AppBar,
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Toolbar,
  Typography,
} from '@mui/material';
import type { SessionResponse } from '@warehouse/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from './session.js';
import { apiRequest, setCsrfToken } from '../lib/api/client.js';
import { ApiProblem } from '../lib/api/problem.js';

const adminLinks: ReadonlyArray<readonly [string, string]> = [
  ['/', 'nav.overview'],
  ['/inventory', 'nav.inventory'],
  ['/catalog', 'nav.catalog'],
  ['/routes', 'nav.routes'],
  ['/customers', 'nav.customers'],
  ['/users', 'nav.users'],
  ['/settings', 'nav.settings'],
];
const driverLinks: ReadonlyArray<readonly [string, string]> = [
  ['/', 'nav.overview'],
  ['/sales/new', 'nav.newSale'],
  ['/routes', 'nav.myRoute'],
  ['/sales', 'nav.mySales'],
  ['/settings', 'nav.settings'],
];

export function AppLayout() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      setCsrfToken(null);
      queryClient.setQueryData<SessionResponse | null>(['session'], null);
      void navigate('/login', { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiProblem && error.isAuthenticationFailure) {
        setCsrfToken(null);
        queryClient.setQueryData<SessionResponse | null>(['session'], null);
        void navigate('/login', { replace: true });
      }
    },
  });

  if (session.loading)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress aria-label={t('auth.checkingSession')} />
      </Box>
    );
  if (!session.user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  const links = session.user?.role === 'ADMINISTRATOR' ? adminLinks : driverLinks;
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {t('app.name')}
          </Typography>
          {links.map(([to, label]) => (
            <Button key={to} color="inherit" component={NavLink} to={to}>
              {t(label)}
            </Button>
          ))}
          <Typography sx={{ display: { xs: 'none', md: 'block' }, ml: 2 }} variant="body2">
            {session.user.displayName}
          </Typography>
          <Button color="inherit" disabled={logout.isPending} onClick={() => logout.mutate()}>
            {logout.isPending ? t('auth.signingOut') : t('auth.signOut')}
          </Button>
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ py: 3 }}>
        {logout.isError &&
          !(logout.error instanceof ApiProblem && logout.error.isAuthenticationFailure) && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {t('auth.signOutFailed')}
            </Alert>
          )}
        <Outlet />
      </Container>
    </>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  const { t } = useTranslation();
  return <Typography variant="h4">{t(title)}</Typography>;
}

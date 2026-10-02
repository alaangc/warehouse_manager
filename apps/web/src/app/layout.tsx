import {
  AppBar,
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import type { SessionResponse } from '@warehouse/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  Home,
  Package,
  Truck,
  ShoppingCart,
  ReceiptText,
  Users,
  Settings,
  ChartNoAxesCombined,
  Wallet,
  Printer,
  Menu,
  X,
  LogOut,
  Tags,
  UserRound,
} from 'lucide-react';
import { useSession } from './session.js';
import { apiRequest, setCsrfToken } from '../lib/api/client.js';
import { ApiProblem } from '../lib/api/problem.js';
import { LanguageSettingsButton } from '../features/settings/language-settings.js';

const adminLinks: ReadonlyArray<readonly [string, string]> = [
  ['/', 'nav.overview'],
  ['/inventory', 'nav.inventory'],
  ['/catalog', 'nav.catalog'],
  ['/routes', 'nav.routes'],
  ['/vehicles', 'catalog.vehicles'],
  ['/customers', 'nav.customers'],
  ['/cash-closes', 'reports.cashCloses'],
  ['/reports', 'reports.title'],
  ['/users', 'nav.users'],
  ['/printer-profiles', 'printers.title'],
  ['/documents', 'documents.title'],
  ['/settings', 'nav.settings'],
];
const driverLinks: ReadonlyArray<readonly [string, string]> = [
  ['/', 'nav.overview'],
  ['/sales/new', 'nav.newSale'],
  ['/routes', 'nav.myRoute'],
  ['/sales', 'nav.mySales'],
  ['/documents', 'documents.title'],
  ['/settings', 'nav.settings'],
];

const icons = {
  '/': Home,
  '/inventory': Package,
  '/catalog': Tags,
  '/routes': Truck,
  '/vehicles': Truck,
  '/customers': Users,
  '/cash-closes': Wallet,
  '/reports': ChartNoAxesCombined,
  '/users': UserRound,
  '/printer-profiles': Printer,
  '/documents': ReceiptText,
  '/settings': Settings,
  '/sales/new': ShoppingCart,
  '/sales': ReceiptText,
};

export function AppLayout() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const administrator = session.user.role === 'ADMINISTRATOR';
  const primaryLinks = administrator
    ? [
        ['/', 'ui.home'],
        ['/inventory', 'nav.inventory'],
        ['/routes', 'nav.routes'],
        ['/reports', 'reports.title'],
      ]
    : [
        ['/', 'ui.home'],
        ['/sales/new', 'ui.sell'],
        ['/routes', 'nav.myRoute'],
        ['/sales', 'ui.tickets'],
      ];
  const navigation = (close = false) =>
    links.map(([to, label]) => {
      const Icon = icons[to as keyof typeof icons] ?? Package;
      return (
        <Button
          key={to}
          component={NavLink}
          to={to}
          end={to === '/'}
          startIcon={<Icon size={20} />}
          onClick={() => {
            if (close) setMobileMenuOpen(false);
          }}
          sx={{
            justifyContent: 'flex-start',
            color: 'text.secondary',
            px: 2,
            '&.active': { color: 'primary.main', bgcolor: '#f0eaff', fontWeight: 750 },
          }}
        >
          {t(to === '/' ? 'ui.home' : label)}
        </Button>
      );
    });
  return (
    <>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'fixed',
          left: 16,
          top: -100,
          zIndex: 1600,
          p: 2,
          bgcolor: 'background.paper',
          '&:focus': { top: 12 },
        }}
      >
        {t('ui.skip')}
      </Box>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', lg: 'block' },
          '& .MuiDrawer-paper': {
            width: 248,
            p: 2,
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 1, py: 2.5 }}>
          <Box
            component="img"
            src="/stock-control-logo.png"
            alt=""
            sx={{ width: 42, height: 42, objectFit: 'contain' }}
          />
          <Typography variant="h6">Stock Control</Typography>
        </Stack>
        <Typography variant="overline" color="text.secondary" sx={{ px: 2, mt: 2 }}>
          {t('ui.operation')}
        </Typography>
        <Stack component="nav" spacing={0.5} aria-label={t('ui.workspace')}>
          {navigation()}
        </Stack>
        <Box sx={{ flexGrow: 1 }} />
        <Divider sx={{ my: 2 }} />
        <Typography sx={{ px: 2, fontWeight: 700, overflowWrap: 'anywhere' }}>
          {session.user.displayName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, mb: 1 }}>
          {t(administrator ? 'ui.admin' : 'ui.seller')}
        </Typography>
        <Button
          startIcon={<LogOut size={18} />}
          sx={{ justifyContent: 'flex-start' }}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {t('auth.signOut')}
        </Button>
      </Drawer>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
          ml: { lg: '248px' },
          width: { lg: 'calc(100% - 248px)' },
        }}
      >
        <Toolbar>
          <Box
            component="img"
            src="/stock-control-logo.png"
            alt=""
            sx={{ width: 32, height: 32, mr: 1, display: { lg: 'none' } }}
          />
          <Box sx={{ flexGrow: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>Stock Control</Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              {t(administrator ? 'ui.admin' : 'ui.seller')}
            </Typography>
          </Box>
          <LanguageSettingsButton />
          <IconButton
            aria-label={t('nav.openMenu')}
            color="inherit"
            onClick={() => setMobileMenuOpen(true)}
            sx={{ display: { xs: 'inline-flex', lg: 'none' } }}
          >
            <Menu size={22} />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer
        anchor="right"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        slotProps={{ paper: { sx: { width: 'min(84vw, 320px)' } } }}
      >
        <Stack spacing={1} sx={{ p: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{session.user.displayName}</Typography>
              <Typography color="text.secondary" variant="caption">
                {t('app.name')}
              </Typography>
            </Box>
            <IconButton aria-label={t('nav.closeMenu')} onClick={() => setMobileMenuOpen(false)}>
              <X size={22} />
            </IconButton>
          </Stack>
          <Divider />
          <LanguageSettingsButton />
          {navigation(true)}
          <Divider />
          <Button
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            sx={{ justifyContent: 'flex-start' }}
          >
            {logout.isPending ? t('auth.signingOut') : t('auth.signOut')}
          </Button>
        </Stack>
      </Drawer>
      <Box sx={{ ml: { lg: '248px' } }}>
        <Container
          id="main-content"
          tabIndex={-1}
          component="main"
          maxWidth="xl"
          sx={{
            pt: { xs: 2.5, md: 4 },
            pb: { xs: 'calc(104px + env(safe-area-inset-bottom))', lg: 5 },
            px: { xs: 2, md: 4 },
            maxWidth: '1440px !important',
            minWidth: 0,
          }}
        >
          {logout.isError &&
            !(logout.error instanceof ApiProblem && logout.error.isAuthenticationFailure) && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {t('auth.signOutFailed')}
              </Alert>
            )}
          <Outlet />
        </Container>
      </Box>
      <Box
        component="nav"
        aria-label={t('ui.operation')}
        sx={{
          display: { xs: 'grid', lg: 'none' },
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          pb: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -4px 24px #17203906',
        }}
      >
        {primaryLinks.map(([to, label]) => {
          const Icon = icons[to as keyof typeof icons] ?? Home;
          return (
            <Button
              key={to}
              component={NavLink}
              to={to!}
              end={to === '/'}
              sx={{
                flexDirection: 'column',
                gap: 0.5,
                minWidth: 0,
                px: 0.25,
                py: 1.25,
                borderRadius: 0,
                color: 'text.secondary',
                fontSize: '0.75rem',
                '&.active': {
                  color: 'primary.main',
                  bgcolor: '#f7f3ff',
                  boxShadow: 'inset 0 3px #6020ee',
                },
              }}
            >
              <Icon size={21} />
              {t(label!)}
            </Button>
          );
        })}
        <Button
          onClick={() => setMobileMenuOpen(true)}
          sx={{
            flexDirection: 'column',
            gap: 0.5,
            minWidth: 0,
            px: 0,
            color: 'text.secondary',
            fontSize: '0.75rem',
          }}
        >
          <Menu size={21} />
          {t('ui.more')}
        </Button>
      </Box>
    </>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  const { t } = useTranslation();
  return <Typography variant="h4">{t(title)}</Typography>;
}

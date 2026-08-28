import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  Toolbar,
  Typography,
} from '@mui/material';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from './session.js';

const adminLinks = [
  ['/', 'Overview'],
  ['/inventory', 'Inventory'],
  ['/catalog', 'Catalog'],
  ['/routes', 'Routes'],
  ['/customers', 'Customers'],
  ['/users', 'Users'],
];
const driverLinks = [
  ['/', 'Overview'],
  ['/sales/new', 'New sale'],
  ['/routes', 'My route'],
  ['/sales', 'My sales'],
];

export function AppLayout() {
  const session = useSession();
  if (session.loading)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress aria-label="Loading session" />
      </Box>
    );
  const links = session.user?.role === 'ADMINISTRATOR' ? adminLinks : driverLinks;
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Warehouse Manager
          </Typography>
          {session.user &&
            links.map(([to, label]) => (
              <Button key={to} color="inherit" component={NavLink} to={to!}>
                {label}
              </Button>
            ))}
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  return <Typography variant="h4">{title}</Typography>;
}

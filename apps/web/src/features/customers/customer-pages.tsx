import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { CustomerForm } from './customer-form.js';
import { CustomerHistory } from './customer-history.js';
import { CustomerPrices } from './customer-prices.js';
import type { Customer } from './customer-types.js';

type StatusFilter = 'all' | 'active' | 'archived';

function CustomerProfile({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const details = [
    [t('customers.contactName'), customer.contactName],
    [t('customers.phone'), customer.phone],
    [t('customers.email'), customer.email],
    [t('customers.address'), customer.address],
    [t('customers.city'), customer.city],
    [t('customers.notes'), customer.notes],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Box
          aria-hidden="true"
          sx={{
            alignItems: 'center',
            bgcolor: 'rgba(23, 74, 114, 0.09)',
            borderRadius: 3,
            color: 'primary.main',
            display: 'flex',
            fontSize: 28,
            fontWeight: 800,
            height: 64,
            justifyContent: 'center',
            width: 64,
          }}
        >
          {customer.displayName.slice(0, 2).toLocaleUpperCase()}
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
          >
            <Box>
              <Typography component="h2" variant="h5" sx={{ fontWeight: 750 }}>
                {customer.displayName}
              </Typography>
              <Typography color="text.secondary">{customer.customerNumber}</Typography>
            </Box>
            <Chip
              color={customer.active ? 'success' : 'default'}
              label={customer.active ? t('common.active') : t('common.archived')}
              size="small"
              sx={{ alignSelf: 'flex-start' }}
            />
          </Stack>
          <Box
            component="dl"
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
              m: 0,
              mt: 2,
            }}
          >
            {details.map(([label, value]) => (
              <Box key={label}>
                <Typography color="text.secondary" component="dt" variant="caption">
                  {label}
                </Typography>
                <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Stack>
    </Paper>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Paper variant="outlined" sx={{ borderTop: `4px solid ${tone}`, p: 2 }}>
      <Typography variant="h5" sx={{ color: tone, fontWeight: 750 }}>
        {value}
      </Typography>
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
    </Paper>
  );
}

export function CustomerPages() {
  const { t } = useTranslation();
  const session = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const administrator = session.user?.role === 'ADMINISTRATOR';
  const activeFilter = !administrator ? true : status === 'all' ? undefined : status === 'active';
  const customers = useQuery({
    queryKey: ['customers', search, activeFilter],
    queryFn: () => {
      const query = new URLSearchParams({ search });
      if (activeFilter !== undefined) query.set('active', String(activeFilter));
      return apiRequest<{ data: Customer[] }>(`/customers?${query}`);
    },
  });
  const rows = customers.data?.data ?? [];
  const activeShown = rows.filter((customer) => customer.active).length;
  const archivedShown = rows.length - activeShown;

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 750 }}>
            {t('customers.title')}
          </Typography>
          <Typography color="text.secondary">{t('customers.overviewDescription')}</Typography>
        </Box>
        {administrator && (
          <Button
            onClick={() => {
              setSelected(null);
              setCreating(true);
            }}
            variant="contained"
          >
            {t('customers.newCustomer')}
          </Button>
        )}
      </Stack>

      {customers.error && (
        <Alert severity="error">{localizedErrorMessage(customers.error, t)}</Alert>
      )}
      {!administrator && <Alert severity="info">{t('customers.driverDirectoryHelp')}</Alert>}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            fullWidth
            label={t('customers.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {administrator && (
            <TextField
              select
              label={t('customers.statusFilter')}
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              sx={{ minWidth: { md: 220 } }}
            >
              <MenuItem value="all">{t('customers.allStatuses')}</MenuItem>
              <MenuItem value="active">{t('customers.activeOnly')}</MenuItem>
              <MenuItem value="archived">{t('customers.archivedOnly')}</MenuItem>
            </TextField>
          )}
        </Stack>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        <Metric label={t('customers.customersShown')} value={rows.length} tone="#2b6cb0" />
        <Metric label={t('customers.activeShown')} value={activeShown} tone="#2f855a" />
        <Metric label={t('customers.archivedShown')} value={archivedShown} tone="#718096" />
      </Box>

      {customers.isLoading && <CircularProgress aria-label={t('customers.loading')} />}

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(300px, 0.7fr) minmax(0, 1.3fr)' },
        }}
      >
        <Stack spacing={1.5}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('customers.directory')}
          </Typography>
          {rows.map((customer) => (
            <Paper
              component="button"
              type="button"
              key={customer.id}
              onClick={() => {
                setSelected(customer);
                setCreating(false);
              }}
              aria-pressed={selected?.id === customer.id}
              variant="outlined"
              sx={{
                bgcolor:
                  selected?.id === customer.id ? 'rgba(23, 74, 114, 0.06)' : 'background.paper',
                borderColor: selected?.id === customer.id ? 'primary.main' : 'divider',
                color: 'text.primary',
                cursor: 'pointer',
                font: 'inherit',
                p: 2,
                textAlign: 'left',
                width: '100%',
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Box
                  aria-hidden="true"
                  sx={{
                    alignItems: 'center',
                    bgcolor: 'rgba(23, 74, 114, 0.08)',
                    borderRadius: 2,
                    color: 'primary.main',
                    display: 'flex',
                    fontWeight: 750,
                    height: 42,
                    justifyContent: 'center',
                    width: 42,
                  }}
                >
                  {customer.displayName.slice(0, 1).toLocaleUpperCase()}
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }}>{customer.displayName}</Typography>
                  <Typography color="text.secondary" variant="body2">
                    {customer.customerNumber} · {customer.city}
                  </Typography>
                </Box>
                <Chip
                  color={customer.active ? 'success' : 'default'}
                  label={customer.active ? t('common.active') : t('common.archived')}
                  size="small"
                />
              </Stack>
            </Paper>
          ))}
          {!customers.isLoading && rows.length === 0 && (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography color="text.secondary">{t('customers.noCustomers')}</Typography>
            </Paper>
          )}
        </Stack>

        <Stack spacing={2}>
          {!creating && !selected && (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">{t('customers.selectCustomerHelp')}</Typography>
            </Paper>
          )}
          {selected && <CustomerProfile customer={selected} />}
          {!administrator && selected && (
            <Alert severity="info">{t('customers.driverReadOnly')}</Alert>
          )}
          {administrator && (creating || selected) && (
            <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
              <CustomerForm
                {...(selected ? { customer: selected } : {})}
                onSaved={(customer) => {
                  setSelected(customer);
                  setCreating(false);
                }}
              />
            </Paper>
          )}
          {administrator && selected && (
            <>
              <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
                <CustomerPrices customerId={selected.id} />
              </Paper>
              <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }}>
                <CustomerHistory customerId={selected.id} />
              </Paper>
            </>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

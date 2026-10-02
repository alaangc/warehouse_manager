import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Plus, Search, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSession } from '../../app/session.js';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { apiRequest } from '../../lib/api/client.js';
import { useInventoryBalances, type InventoryBalance } from './inventory-queries.js';
import { quantityFromScaled, scaledQuantity } from './inventory-quantity.js';

function totalQuantity(rows: InventoryBalance[]): string {
  return quantityFromScaled(rows.reduce((total, row) => total + scaledQuantity(row.quantity), 0n));
}

function InventoryStatus({ balance }: { balance: InventoryBalance }) {
  const { t } = useTranslation();
  if (scaledQuantity(balance.quantity) === 0n)
    return <Chip color="error" size="small" label={t('inventory.outOfStock')} />;
  if (balance.lowStockAlert)
    return <Chip color="warning" size="small" label={t('inventory.lowStock')} />;
  return <Chip color="success" size="small" label={t('common.available')} />;
}

export function InventoryPage() {
  const { t } = useTranslation();
  const compact = useMediaQuery('(max-width:899px)');
  const session = useSession();
  const administrator = session.user?.role === 'ADMINISTRATOR';
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const balances = useInventoryBalances({
    alertsOnly,
    search: search.trim(),
    ...(administrator ? { locationKind: 'BRANCH' as const } : {}),
  });
  const branches = useQuery({
    queryKey: ['locations'],
    queryFn: () =>
      apiRequest<{ data: Array<{ id: string; name: string; active: boolean }> }>('/locations'),
    enabled: administrator,
  });
  const rows = useMemo(
    () =>
      (balances.data?.data ?? []).filter(
        (row) =>
          !administrator ||
          (row.stockLocation.kind === 'BRANCH' &&
            (!branches.data ||
              branches.data.data.some(
                (branch) => branch.active && branch.id === row.stockLocation.branchId,
              ))),
      ),
    [balances.data?.data, administrator, branches.data],
  );
  const locationKey = (row: InventoryBalance) =>
    administrator ? row.stockLocation.branchId : row.stockLocation.id;
  const locations = useMemo(
    () =>
      (administrator
        ? (branches.data?.data ?? [])
            .filter((branch) => branch.active)
            .map((branch) => ({
              id: branch.id,
              label: branch.name,
              kind: 'BRANCH' as const,
              branchId: branch.id,
              routeId: null,
            }))
        : [...new Map(rows.map((row) => [row.stockLocation.id, row.stockLocation])).values()]
      ).sort((left, right) => left.label.localeCompare(right.label)),
    [rows, administrator, branches.data],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredRows = rows.filter(
    (row) =>
      (!locationId || locationKey(row) === locationId) &&
      (!normalizedSearch ||
        `${row.productName} ${row.productId} ${row.stockLocation.label}`
          .toLocaleLowerCase()
          .includes(normalizedSearch)),
  );
  const groupedLocations = locations.map((location) => {
    const locationRows = filteredRows.filter((row) => locationKey(row) === location.id);
    return {
      location,
      rows: locationRows,
      lowStockCount: locationRows.filter((row) => row.lowStockAlert).length,
      quantity: totalQuantity(locationRows),
    };
  });
  const uniqueProducts = new Set(rows.map((row) => row.productId)).size;
  const lowStockCount = rows.filter((row) => row.lowStockAlert).length;
  const outOfStockCount = rows.filter((row) => scaledQuantity(row.quantity) === 0n).length;
  const metrics = [
    { label: t('inventory.productsShown'), value: uniqueProducts, tone: '#2b6cb0' },
    { label: t('inventory.locationsShown'), value: locations.length, tone: '#2f855a' },
    { label: t('inventory.lowStockBalances'), value: lowStockCount, tone: '#d97706' },
    { label: t('inventory.outOfStock'), value: outOfStockCount, tone: '#c53030' },
  ];

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 750 }}>
            {t('inventory.title')}
          </Typography>
          <Typography color="text.secondary">{t('inventory.overviewDescription')}</Typography>
        </Box>
        {administrator && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button component={Link} to="/inventory/movements">
              {t('inventory.movementHistory')}
            </Button>
            <Button
              component={Link}
              to="/inventory/operations/new"
              variant="contained"
              startIcon={<Plus size={20} />}
            >
              {t('inventory.recordOperation')}
            </Button>
          </Stack>
        )}
      </Stack>

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
          <Paper
            key={metric.label}
            variant="outlined"
            sx={{ p: { xs: 2, md: 2.5 }, textAlign: 'center' }}
          >
            <Box
              sx={{
                display: 'inline-flex',
                p: 1.25,
                borderRadius: 2,
                color: metric.tone,
                bgcolor: `${metric.tone}12`,
                mb: 1,
              }}
            >
              <Package size={24} />
            </Box>
            <Typography variant="h4" sx={{ color: metric.tone, fontWeight: 750 }}>
              {metric.value}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {metric.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            fullWidth
            label={t('inventory.searchInventory')}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={20} />
                  </InputAdornment>
                ),
              },
            }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FormControl sx={{ minWidth: { md: 240 } }}>
            <InputLabel id="inventory-location-filter-label">{t('inventory.location')}</InputLabel>
            <Select
              labelId="inventory-location-filter-label"
              label={t('inventory.location')}
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <MenuItem value="">{t('inventory.allLocations')}</MenuItem>
              {locations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {location.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            sx={{ minWidth: { md: 245 } }}
            control={
              <Switch
                checked={alertsOnly}
                onChange={(_, checked) => {
                  setAlertsOnly(checked);
                  setLocationId('');
                }}
              />
            }
            label={t('inventory.showAlertsOnly')}
          />
        </Stack>
      </Paper>

      {balances.isLoading && <CircularProgress aria-label={t('inventory.loading')} />}
      {balances.error && <Alert severity="error">{localizedErrorMessage(balances.error, t)}</Alert>}
      {branches.error && <Alert severity="error">{localizedErrorMessage(branches.error, t)}</Alert>}

      {!balances.isLoading && locations.length > 0 && (
        <Stack spacing={1.5}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('inventory.byLocation')}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
            }}
          >
            {groupedLocations.map(({ location, rows: locationRows, lowStockCount, quantity }) => (
              <Paper
                component="button"
                type="button"
                key={location.id}
                onClick={() =>
                  setLocationId((current) => (current === location.id ? '' : location.id))
                }
                variant="outlined"
                aria-pressed={locationId === location.id}
                sx={{
                  bgcolor:
                    locationId === location.id ? 'rgba(23, 74, 114, 0.06)' : 'background.paper',
                  borderColor: locationId === location.id ? 'primary.main' : 'divider',
                  color: 'text.primary',
                  cursor: 'pointer',
                  font: 'inherit',
                  p: 2.5,
                  textAlign: 'left',
                }}
              >
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {location.label}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {location.kind === 'BRANCH'
                        ? t('inventory.branchInventory')
                        : t('inventory.routeInventory')}
                    </Typography>
                  </Box>
                  {lowStockCount > 0 && (
                    <Chip color="warning" size="small" label={`${lowStockCount}`} />
                  )}
                </Stack>
                <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('inventory.productsShown')}
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>{locationRows.length}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('inventory.totalUnitsShown')}
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>{formatDecimal(quantity)}</Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Box>
        </Stack>
      )}

      <Stack spacing={1.5}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {t('inventory.balances')}
        </Typography>
        {compact ? (
          <Stack spacing={1.5}>
            {filteredRows.map((balance) => (
              <Paper variant="outlined" key={balance.id} sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontWeight: 700 }}>{balance.productName}</Typography>
                    <InventoryStatus balance={balance} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {balance.stockLocation.label}
                  </Typography>
                  <Stack
                    direction="row"
                    sx={{ justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Typography variant="h5">{formatDecimal(balance.quantity)}</Typography>
                    <Button
                      component={Link}
                      to={`/inventory/products/${balance.productId}`}
                      endIcon={<ArrowRight size={18} />}
                    >
                      {t('inventory.viewProduct')}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
            {!balances.isLoading && filteredRows.length === 0 && (
              <Typography>{t('inventory.noBalances')}</Typography>
            )}
          </Stack>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table aria-label={t('inventory.balances')} aria-busy={balances.isFetching}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('common.product')}</TableCell>
                  <TableCell>{t('inventory.location')}</TableCell>
                  <TableCell align="right">{t('common.quantity')}</TableCell>
                  <TableCell>{t('common.status')}</TableCell>
                  <TableCell>{t('inventory.updated')}</TableCell>
                  <TableCell align="right">{t('catalog.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((balance) => (
                  <TableRow key={balance.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 650 }}>{balance.productName}</Typography>
                    </TableCell>
                    <TableCell>{balance.stockLocation.label}</TableCell>
                    <TableCell align="right">{formatDecimal(balance.quantity)}</TableCell>
                    <TableCell>
                      <InventoryStatus balance={balance} />
                    </TableCell>
                    <TableCell>{formatDateTime(balance.updatedAt)}</TableCell>
                    <TableCell align="right">
                      <Button
                        component={Link}
                        size="small"
                        to={`/inventory/products/${balance.productId}`}
                      >
                        {t('inventory.viewProduct')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!balances.isLoading && filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>{t('inventory.noBalances')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Stack>
  );
}

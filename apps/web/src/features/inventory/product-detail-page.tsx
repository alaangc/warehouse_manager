import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../app/session.js';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { quantityFromScaled, scaledQuantity } from './inventory-quantity.js';
import {
  useInventoryBalances,
  useInventoryMovements,
  useInventoryProduct,
  type InventoryBalance,
} from './inventory-queries.js';

interface CatalogReference {
  id: string;
  name: string;
}

function totalQuantity(rows: InventoryBalance[]): string {
  return quantityFromScaled(rows.reduce((total, row) => total + scaledQuantity(row.quantity), 0n));
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

export function ProductDetailPage() {
  const { t } = useTranslation();
  const session = useSession();
  const { productId = '' } = useParams();
  const administrator = session.user?.role === 'ADMINISTRATOR';
  const product = useInventoryProduct(productId);
  const balances = useInventoryBalances({ productId });
  const movements = useInventoryMovements(
    { productId },
    { enabled: administrator && Boolean(productId) },
  );
  const references = useQuery({
    queryKey: ['inventory-product-references'],
    queryFn: async () => {
      const [categories, units] = await Promise.all([
        apiRequest<{ data: CatalogReference[] }>('/categories'),
        apiRequest<{ data: CatalogReference[] }>('/units'),
      ]);
      return { categories: categories.data, units: units.data };
    },
  });
  const error = product.error ?? balances.error ?? references.error ?? movements.error;
  const record = product.data?.data;
  const balanceRows = balances.data?.data ?? [];
  const total = totalQuantity(balanceRows);
  const lowStockLocations = balanceRows.filter((balance) => balance.lowStockAlert).length;
  const categoryName =
    references.data?.categories.find((category) => category.id === record?.categoryId)?.name ??
    record?.categoryId ??
    '—';
  const unitName =
    references.data?.units.find((unit) => unit.id === record?.unitId)?.name ??
    record?.unitId ??
    '—';
  const recentMovements = movements.data?.data.slice(0, 5) ?? [];

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Button component={Link} to="/inventory" sx={{ alignSelf: 'flex-start' }}>
          ← {t('inventory.backToInventory')}
        </Button>
        {administrator && (
          <Stack direction="row" spacing={1}>
            <Button component={Link} to="/catalog">
              {t('inventory.openCatalog')}
            </Button>
            <Button component={Link} to="/inventory/operations/new" variant="contained">
              {t('inventory.recordOperation')}
            </Button>
          </Stack>
        )}
      </Stack>

      {(product.isLoading || balances.isLoading || references.isLoading) && (
        <CircularProgress aria-label={t('inventory.loadingProduct')} />
      )}
      {error && <Alert severity="error">{localizedErrorMessage(error, t)}</Alert>}

      {record && (
        <>
          <Paper
            variant="outlined"
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' },
              p: { xs: 2.5, md: 4 },
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                alignItems: 'center',
                background: lowStockLocations
                  ? 'linear-gradient(145deg, #fff4d6, #f6ad55)'
                  : 'linear-gradient(145deg, #e5f2ff, #4f8fca)',
                borderRadius: 4,
                color: lowStockLocations ? '#8a4b08' : '#123e66',
                display: 'flex',
                fontSize: 34,
                fontWeight: 800,
                height: 112,
                justifyContent: 'center',
                width: 112,
              }}
            >
              {record.name.slice(0, 2).toLocaleUpperCase()}
            </Box>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography component="h1" variant="h4" sx={{ fontWeight: 750 }}>
                  {record.name}
                </Typography>
                <Chip
                  color={record.active ? 'success' : 'default'}
                  label={record.active ? t('common.active') : t('common.archived')}
                  size="small"
                />
                {lowStockLocations > 0 && (
                  <Chip color="warning" label={t('inventory.lowStock')} size="small" />
                )}
              </Stack>
              <Typography color="text.secondary">
                {record.sku} · {categoryName} · {unitName}
              </Typography>
              <Typography>{record.description ?? t('inventory.noDescription')}</Typography>
            </Stack>
          </Paper>

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
            {[
              [t('inventory.totalUnitsShown'), formatDecimal(total)],
              [t('inventory.locationsShown'), String(balanceRows.length)],
              [t('catalog.lowStockThreshold'), formatDecimal(record.lowStockThreshold)],
              [t('catalog.standardUnitPrice'), `MXN ${formatDecimal(record.standardUnitPrice)}`],
            ].map(([label, value]) => (
              <Paper key={label} variant="outlined" sx={{ p: 2.5 }}>
                <Typography color="text.secondary" variant="body2">
                  {label}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 750, mt: 0.5 }}>
                  {value}
                </Typography>
              </Paper>
            ))}
          </Box>

          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.5fr) minmax(280px, 0.75fr)' },
            }}
          >
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {t('inventory.stockByLocation')}
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                {t('inventory.stockByLocationHelp')}
              </Typography>
              <Stack divider={<Divider flexItem />}>
                {balanceRows.map((balance) => (
                  <Stack
                    direction="row"
                    key={balance.id}
                    sx={{ justifyContent: 'space-between', gap: 2, py: 2 }}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 650 }}>
                        {balance.stockLocation.label}
                      </Typography>
                      <Typography color="text.secondary" variant="caption">
                        {balance.stockLocation.kind === 'BRANCH'
                          ? t('inventory.branchInventory')
                          : t('inventory.routeInventory')}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontWeight: 750 }}>
                        {formatDecimal(balance.quantity)}
                      </Typography>
                      <Typography
                        color={balance.lowStockAlert ? 'warning.main' : 'success.main'}
                        variant="caption"
                      >
                        {balance.lowStockAlert ? t('inventory.lowStock') : t('common.available')}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
                {!balances.isLoading && balanceRows.length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    {t('inventory.noBalances')}
                  </Typography>
                )}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                {t('inventory.productData')}
              </Typography>
              <Stack component="dl" spacing={2} sx={{ m: 0 }}>
                <DetailItem label={t('catalog.sku')} value={record.sku} />
                <DetailItem label={t('catalog.category')} value={categoryName} />
                <DetailItem label={t('catalog.unit')} value={unitName} />
                <DetailItem
                  label={t('common.status')}
                  value={record.active ? t('common.active') : t('common.archived')}
                />
                <DetailItem label={t('inventory.productIdLabel')} value={record.id} />
              </Stack>
            </Paper>
          </Box>

          {administrator && (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ justifyContent: 'space-between', mb: 2 }}
              >
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {t('inventory.recentMovements')}
                  </Typography>
                  <Typography color="text.secondary">
                    {t('inventory.recentMovementsHelp')}
                  </Typography>
                </Box>
                <Button
                  component={Link}
                  to={`/inventory/movements?productId=${encodeURIComponent(record.id)}`}
                >
                  {t('inventory.movementHistory')}
                </Button>
              </Stack>
              {movements.isLoading && <CircularProgress aria-label={t('common.loading')} />}
              <TableContainer>
                <Table size="small" aria-label={t('inventory.recentMovements')}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('common.date')}</TableCell>
                      <TableCell>{t('common.type')}</TableCell>
                      <TableCell>{t('inventory.source')}</TableCell>
                      <TableCell>{t('inventory.destination')}</TableCell>
                      <TableCell align="right">{t('common.quantity')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                        <TableCell>
                          {t(`operation.${movement.operationType}`, {
                            defaultValue: movement.operationType,
                          })}
                        </TableCell>
                        <TableCell>{movement.source?.label ?? '—'}</TableCell>
                        <TableCell>{movement.destination?.label ?? '—'}</TableCell>
                        <TableCell align="right">{formatDecimal(movement.quantity)}</TableCell>
                      </TableRow>
                    ))}
                    {!movements.isLoading && recentMovements.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>{t('inventory.noMovements')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}

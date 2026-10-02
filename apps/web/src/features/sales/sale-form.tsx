import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDecimal } from '../../i18n/format.js';
import { apiRequest } from '../../lib/api/client.js';
import { idempotencyKey } from '../../lib/api/idempotency.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { scaledQuantity, quantityFromScaled } from '../inventory/inventory-quantity.js';
import { useRouteDetail, useRoutes } from '../routes/route-queries.js';
import { CustomerPicker } from './customer-product-picker.js';
import { SaleResult } from './sale-result.js';

interface SaleLineValues {
  productId: string;
  quantity: string;
}

interface SaleValues {
  routeId: string;
  customerId: string;
  lines: SaleLineValues[];
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD';
}

interface QuoteLine {
  productId: string;
  productName: string;
  categoryName: string;
  unitCode: string;
  quantity: string;
  appliedPriceSource: 'CUSTOMER' | 'STANDARD';
  unitPrice: string;
  lineAmount: string;
  availableQuantity: string;
  available: boolean;
}

interface Quote {
  customerId: string;
  routeId: string;
  currencyCode: string;
  lines: QuoteLine[];
  total: string;
  quotedAt: string;
}

const quantityPattern = /^\d+(?:\.\d{1,3})?$/;

export function SaleForm() {
  const [sequence, setSequence] = useState(0);
  return <SaleWorkflow key={sequence} onNextSale={() => setSequence((value) => value + 1)} />;
}

function SaleWorkflow({ onNextSale }: { onNextSale: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const clientOperationId = useRef(crypto.randomUUID()).current;
  const [step, setStep] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const routes = useRoutes();
  const routeRows = useMemo(() => routes.data?.data ?? [], [routes.data?.data]);
  const activeRoutes = useMemo(
    () => routeRows.filter((route) => route.state === 'EN_ROUTE'),
    [routeRows],
  );
  const form = useForm<SaleValues>({
    defaultValues: {
      routeId: '',
      customerId: '',
      lines: [{ productId: '', quantity: '1' }],
      paymentMethod: 'CASH',
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const selectedRouteId = form.watch('routeId');
  const selectedCustomerId = form.watch('customerId');
  const selectedLines = form.watch('lines');
  const selectedPaymentMethod = form.watch('paymentMethod');
  const route = useRouteDetail(selectedRouteId || null);
  const routeProducts = (route.data?.data.balances ?? []).filter(
    (balance) => scaledQuantity(balance.quantity) > 0n,
  );

  useEffect(() => {
    if (!routes.isLoading && activeRoutes.length > 0) {
      const currentIsActive = activeRoutes.some((candidate) => candidate.id === selectedRouteId);
      if (!currentIsActive) form.setValue('routeId', activeRoutes[0]!.id);
    }
  }, [activeRoutes, form, routes.isLoading, selectedRouteId]);

  function clearQuote() {
    setQuote(null);
    if (step === 2) setStep(1);
  }

  const quoteMutation = useMutation({
    mutationFn: (values: SaleValues) =>
      apiRequest<{ data: Quote }>('/sales/quote', {
        method: 'POST',
        body: {
          customerId: values.customerId,
          routeId: values.routeId,
          lines: values.lines,
        },
      }),
    onSuccess: (response) => {
      setQuote(response.data);
      setStep(2);
    },
  });
  const saleMutation = useMutation({
    mutationFn: (values: SaleValues) =>
      apiRequest<{ data: Record<string, unknown> }>('/sales', {
        method: 'POST',
        idempotencyKey: idempotencyKey(clientOperationId),
        body: {
          clientOperationId,
          customerId: values.customerId,
          routeId: values.routeId,
          paymentMethod: values.paymentMethod,
          lines: values.lines,
        },
      }),
    onSuccess: () => {
      for (const key of ['routes', 'sales', 'inventory-balances', 'role-overview']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  if (saleMutation.data)
    return <SaleResult sale={saleMutation.data.data} onNextSale={onNextSale} />;

  const requestQuote = form.handleSubmit((values) => quoteMutation.mutate(values));
  const submitSale = form.handleSubmit((values) => {
    if (step === 2 && quote?.lines.every((line) => line.available)) saleMutation.mutate(values);
  });
  const usedProducts = new Set(selectedLines.map((line) => line.productId).filter(Boolean));
  const loading = routes.isLoading || (Boolean(selectedRouteId) && route.isLoading);
  const error = routes.error ?? route.error ?? quoteMutation.error ?? saleMutation.error;
  function addProduct(productId: string) {
    const index = selectedLines.findIndex((line) => line.productId === productId);
    if (index >= 0) return;
    const empty = selectedLines.findIndex((line) => !line.productId);
    if (empty >= 0) {
      form.setValue(`lines.${empty}.productId`, productId);
      form.setValue(`lines.${empty}.quantity`, '1');
    } else lines.append({ productId, quantity: '1' });
    clearQuote();
  }
  function adjustQuantity(index: number, delta: bigint) {
    const value = selectedLines[index]?.quantity ?? '';
    if (!quantityPattern.test(value)) return;
    const next = scaledQuantity(value) + delta;
    const product = routeProducts.find(
      (item) => item.productId === selectedLines[index]?.productId,
    );
    if (next <= 0n || !product || next > scaledQuantity(product.quantity)) return;
    form.setValue(`lines.${index}.quantity`, quantityFromScaled(next), { shouldValidate: true });
    clearQuote();
  }

  return (
    <Stack
      component="form"
      spacing={3}
      onSubmit={(event) => void submitSale(event)}
      aria-label={t('sales.saleWorkflow')}
    >
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 750 }}>
          {t('sales.newSale')}
        </Typography>
        <Typography color="text.secondary">{t('sales.newSaleDescription')}</Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stepper activeStep={step} alternativeLabel>
          {[t('sales.stepCustomer'), t('sales.stepProducts'), t('sales.stepReview')].map(
            (label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ),
          )}
        </Stepper>
      </Paper>

      {loading && <CircularProgress aria-label={t('sales.loadingSaleData')} />}
      {error && <Alert severity="error">{localizedErrorMessage(error, t)}</Alert>}
      {!routes.isLoading && activeRoutes.length === 0 && (
        <Alert
          severity="warning"
          action={
            <Button component={Link} color="inherit" size="small" to="/routes">
              {t('sales.openRoutes')}
            </Button>
          }
        >
          {t('sales.noActiveRoute')}
        </Alert>
      )}

      {step === 0 && activeRoutes.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {t('sales.chooseRouteAndCustomer')}
              </Typography>
              <Typography color="text.secondary">
                {t('sales.chooseRouteAndCustomerHelp')}
              </Typography>
            </Box>
            <TextField
              select
              label={t('sales.activeRoute')}
              value={selectedRouteId}
              onChange={(event) => {
                form.setValue('routeId', event.target.value, { shouldValidate: true });
                form.setValue('lines', [{ productId: '', quantity: '1' }]);
                clearQuote();
              }}
            >
              {activeRoutes.map((activeRoute) => (
                <MenuItem key={activeRoute.id} value={activeRoute.id}>
                  {activeRoute.routeNumber}
                </MenuItem>
              ))}
            </TextField>
            <CustomerPicker
              value={selectedCustomerId}
              onChange={(customerId) => {
                form.setValue('customerId', customerId, { shouldValidate: true });
                clearQuote();
              }}
            />
            <Button
              size="large"
              endIcon={<ArrowRight size={20} />}
              disabled={!selectedRouteId || !selectedCustomerId || route.isLoading}
              onClick={() => setStep(1)}
              sx={{ alignSelf: { sm: 'flex-end' } }}
              variant="contained"
            >
              {t('sales.nextProducts')}
            </Button>
          </Stack>
        </Paper>
      )}

      {step === 1 && (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {t('sales.chooseProducts')}
              </Typography>
              <Typography color="text.secondary">{t('sales.chooseProductsHelp')}</Typography>
            </Box>
            {routeProducts.length === 0 && !route.isLoading && (
              <Alert severity="warning">{t('sales.noProductsOnRoute')}</Alert>
            )}
            <TextField
              label={t('ui.searchProducts')}
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={20} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Typography variant="h6">{t('ui.productShelf')}</Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  xl: 'repeat(3, minmax(0, 1fr))',
                },
                maxHeight: 420,
                overflowY: 'auto',
                p: 0.5,
              }}
            >
              {routeProducts
                .filter((product) =>
                  product.productName
                    .toLocaleLowerCase()
                    .includes(productSearch.toLocaleLowerCase()),
                )
                .map((product) => (
                  <Paper
                    key={product.productId}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      borderColor: usedProducts.has(product.productId) ? '#cbbaff' : 'divider',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        bgcolor: '#edf3ff',
                        color: 'secondary.main',
                        p: 1.25,
                        borderRadius: 2,
                      }}
                    >
                      <Package size={24} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }}>{product.productName}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t('sales.availableQuantity', {
                          quantity: formatDecimal(product.quantity),
                        })}
                      </Typography>
                    </Box>
                    <IconButton
                      color="primary"
                      disabled={usedProducts.has(product.productId)}
                      aria-label={t('ui.addProduct', { name: product.productName })}
                      onClick={() => addProduct(product.productId)}
                      sx={{ bgcolor: '#f0eaff' }}
                    >
                      {usedProducts.has(product.productId) ? (
                        <Check size={21} />
                      ) : (
                        <Plus size={21} />
                      )}
                    </IconButton>
                  </Paper>
                ))}
            </Box>
            {routeProducts.length > 0 &&
              !routeProducts.some((product) =>
                product.productName.toLocaleLowerCase().includes(productSearch.toLocaleLowerCase()),
              ) && <Typography color="text.secondary">{t('ui.noResults')}</Typography>}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pt: 1 }}>
              <ShoppingCart size={23} />
              <Typography variant="h6">{t('ui.cart')}</Typography>
              <Chip size="small" label={usedProducts.size} />
            </Stack>
            {lines.fields.map((field, index) => {
              const productId = selectedLines[index]?.productId ?? '';
              const selectedProduct = routeProducts.find(
                (balance) => balance.productId === productId,
              );
              const { ref: quantityRef, ...quantityRegistration } = form.register(
                `lines.${index}.quantity`,
                {
                  required: true,
                  pattern: quantityPattern,
                  validate: (value) => quantityPattern.test(value) && scaledQuantity(value) > 0n,
                  onChange: clearQuote,
                },
              );
              return (
                <Paper key={field.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2}
                    sx={{ alignItems: { md: 'flex-start' } }}
                  >
                    <TextField
                      select
                      fullWidth
                      label={t('common.product')}
                      value={productId}
                      {...form.register(`lines.${index}.productId`, { required: true })}
                      onChange={(event) => {
                        form.setValue(`lines.${index}.productId`, event.target.value, {
                          shouldValidate: true,
                        });
                        clearQuote();
                      }}
                    >
                      {routeProducts.map((product) => (
                        <MenuItem
                          disabled={
                            product.productId !== productId && usedProducts.has(product.productId)
                          }
                          key={product.productId}
                          value={product.productId}
                        >
                          {product.productName}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{
                        alignItems: 'flex-start',
                        minWidth: { md: 260 },
                        width: { xs: '100%', md: 300 },
                      }}
                    >
                      <IconButton
                        aria-label={t('ui.decrease', { name: selectedProduct?.productName ?? '' })}
                        onClick={() => adjustQuantity(index, -1000n)}
                        disabled={
                          !selectedProduct ||
                          !quantityPattern.test(selectedLines[index]?.quantity ?? '') ||
                          scaledQuantity(selectedLines[index]?.quantity ?? '0') <= 1000n
                        }
                      >
                        <Minus size={20} />
                      </IconButton>
                      <TextField
                        label={t('common.quantity')}
                        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                        inputRef={quantityRef}
                        error={Boolean(form.formState.errors.lines?.[index]?.quantity)}
                        helperText={
                          selectedProduct
                            ? t('sales.availableQuantity', {
                                quantity: formatDecimal(selectedProduct.quantity),
                              })
                            : t('inventory.quantityHelp')
                        }
                        {...quantityRegistration}
                      />
                      <IconButton
                        aria-label={t('ui.increase', { name: selectedProduct?.productName ?? '' })}
                        onClick={() => adjustQuantity(index, 1000n)}
                        disabled={
                          !selectedProduct ||
                          !quantityPattern.test(selectedLines[index]?.quantity ?? '') ||
                          scaledQuantity(selectedLines[index]?.quantity ?? '0') + 1000n >
                            scaledQuantity(selectedProduct.quantity)
                        }
                      >
                        <Plus size={20} />
                      </IconButton>
                    </Stack>
                    <Button
                      startIcon={<Trash2 size={17} />}
                      disabled={lines.fields.length === 1 && !productId}
                      onClick={() => {
                        if (lines.fields.length === 1) lines.update(0, { productId: '', quantity: '1' });
                        else lines.remove(index);
                        clearQuote();
                      }}
                    >
                      {t('common.remove')}
                    </Button>
                  </Stack>
                </Paper>
              );
            })}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{
                position: 'sticky',
                bottom: { xs: 'calc(78px + env(safe-area-inset-bottom))', lg: 16 },
                bgcolor: 'background.paper',
                p: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                zIndex: 2,
                boxShadow: '0 4px 24px #1720390c',
              }}
            >
              <Button
                endIcon={<ArrowRight size={19} />}
                disabled={lines.fields.length >= routeProducts.length}
                onClick={() => lines.append({ productId: '', quantity: '1' })}
                variant="outlined"
              >
                {t('sales.addProduct')}
              </Button>
              <Box sx={{ flexGrow: 1 }} />
              <Button onClick={() => setStep(0)}>{t('sales.back')}</Button>
              <Button
                disabled={
                  quoteMutation.isPending ||
                  routeProducts.length === 0 ||
                  selectedLines.some((line) => !line.productId || !line.quantity)
                }
                onClick={() => void requestQuote()}
                variant="contained"
              >
                {quoteMutation.isPending ? t('sales.requestingQuote') : t('ui.review')}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {step === 2 && quote && (
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {t('sales.reviewAndConfirm')}
              </Typography>
              <Typography color="text.secondary">{t('sales.reviewAndConfirmHelp')}</Typography>
            </Box>
            {quote.lines.map((line) => (
              <Paper key={line.productId} variant="outlined" sx={{ p: 2 }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ justifyContent: 'space-between' }}
                >
                  <Box>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 700 }}>{line.productName}</Typography>
                      <Chip
                        color={line.available ? 'success' : 'error'}
                        label={line.available ? t('common.available') : t('sales.unavailable')}
                        size="small"
                      />
                    </Stack>
                    <Typography color="text.secondary" variant="body2">
                      {formatDecimal(line.quantity)} {line.unitCode} × {quote.currencyCode}{' '}
                      {formatDecimal(line.unitPrice)}
                    </Typography>
                    <Typography color="text.secondary" variant="caption">
                      {line.appliedPriceSource === 'CUSTOMER'
                        ? t('sales.customerPrice')
                        : t('sales.standardPrice')}
                    </Typography>
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 750 }}>
                    {quote.currencyCode} {formatDecimal(line.lineAmount)}
                  </Typography>
                </Stack>
              </Paper>
            ))}
            {!quote.lines.every((line) => line.available) && (
              <Alert severity="warning">{t('sales.quoteUnavailable')}</Alert>
            )}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
            >
              <TextField
                select
                label={t('sales.paymentMethod')}
                sx={{ minWidth: { sm: 260 } }}
                value={selectedPaymentMethod}
                onChange={(event) =>
                  form.setValue('paymentMethod', event.target.value as SaleValues['paymentMethod'])
                }
              >
                <MenuItem value="CASH">{t('sales.cash')}</MenuItem>
                <MenuItem value="BANK_TRANSFER">{t('sales.bankTransfer')}</MenuItem>
                <MenuItem value="CARD">{t('sales.card')}</MenuItem>
              </TextField>
              <Box sx={{ textAlign: { sm: 'right' } }}>
                <Typography color="text.secondary">{t('common.total')}</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {quote.currencyCode} {formatDecimal(quote.total)}
                </Typography>
              </Box>
            </Stack>
            <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1}>
              <Button onClick={() => setStep(1)}>{t('sales.backToProducts')}</Button>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                type="submit"
                disabled={saleMutation.isPending || !quote.lines.every((line) => line.available)}
                variant="contained"
              >
                {saleMutation.isPending ? t('sales.confirmingSale') : t('sales.confirmSale')}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

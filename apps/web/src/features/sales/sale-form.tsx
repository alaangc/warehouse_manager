import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDecimal } from '../../i18n/format.js';
import { apiRequest } from '../../lib/api/client.js';
import { idempotencyKey } from '../../lib/api/idempotency.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { scaledQuantity } from '../inventory/inventory-quantity.js';
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
  const { t } = useTranslation();
  const clientOperationId = useRef(crypto.randomUUID()).current;
  const [step, setStep] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
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
  });

  if (saleMutation.data) return <SaleResult sale={saleMutation.data.data} />;

  const requestQuote = form.handleSubmit((values) => quoteMutation.mutate(values));
  const submitSale = form.handleSubmit((values) => {
    if (step === 2 && quote?.lines.every((line) => line.available)) saleMutation.mutate(values);
  });
  const usedProducts = new Set(selectedLines.map((line) => line.productId).filter(Boolean));
  const loading = routes.isLoading || (Boolean(selectedRouteId) && route.isLoading);
  const error = routes.error ?? route.error ?? quoteMutation.error ?? saleMutation.error;

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
            {lines.fields.map((field, index) => {
              const productId = selectedLines[index]?.productId ?? '';
              const selectedProduct = routeProducts.find(
                (balance) => balance.productId === productId,
              );
              return (
                <Paper key={field.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
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
                    <TextField
                      label={t('common.quantity')}
                      inputMode="decimal"
                      error={Boolean(form.formState.errors.lines?.[index]?.quantity)}
                      helperText={
                        selectedProduct
                          ? t('sales.availableQuantity', {
                              quantity: formatDecimal(selectedProduct.quantity),
                            })
                          : t('inventory.quantityHelp')
                      }
                      {...form.register(`lines.${index}.quantity`, {
                        required: true,
                        pattern: quantityPattern,
                        validate: (value) =>
                          quantityPattern.test(value) && scaledQuantity(value) > 0n,
                        onChange: clearQuote,
                      })}
                    />
                    <Button
                      disabled={lines.fields.length === 1}
                      onClick={() => {
                        lines.remove(index);
                        clearQuote();
                      }}
                    >
                      {t('common.remove')}
                    </Button>
                  </Stack>
                </Paper>
              );
            })}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
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
                {quoteMutation.isPending ? t('sales.requestingQuote') : t('sales.reviewQuote')}
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

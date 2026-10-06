import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { formatDateTime, formatDecimal } from '../../i18n/format.js';
import { DocumentCenter } from '../documents/document-center.js';
import { SaleDetailDialog } from './sale-detail.js';

type CreditData = {
  notes: { id: string; saleNumber: string; total: string; completedAt: string }[];
  noteCount: number;
  total: string;
  payments: { id: string; receiptNumber: string; total: string; createdAt: string }[];
};
export function CustomerCredit({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [detail, setDetail] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const request = useRef<{ body: string; key: string } | null>(null);
  const query = useQuery({
    queryKey: ['credits', customerId],
    queryFn: () => apiRequest<{ data: CreditData }>(`/customers/${customerId}/credits`),
  });
  const data = query.data?.data;
  const notes = data?.notes.filter((n) => selected.includes(n.id)) ?? [];
  const cents = notes.reduce((sum, n) => sum + BigInt(n.total.replace('.', '')), 0n);
  const total = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  const payment = useMutation({
    mutationFn: () => {
      const body = { saleIds: notes.map((n) => n.id).sort(), paymentMethod };
      const serialized = JSON.stringify(body);
      if (request.current?.body !== serialized)
        request.current = { body: serialized, key: crypto.randomUUID() };
      return apiRequest<{ data: { id: string } }>(`/customers/${customerId}/credit-payments`, {
        method: 'POST',
        body,
        idempotencyKey: request.current.key,
      });
    },
    onSuccess: (result) => {
      setReceipt(result.data.id);
      setSelected([]);
      setConfirm(false);
      request.current = null;
      void client.invalidateQueries({ queryKey: ['credits', customerId] });
      void client.invalidateQueries({ queryKey: ['customers', customerId, 'sales'] });
    },
  });
  return (
    <Stack spacing={2} component="section" aria-label={t('credit.title')}>
      <Typography variant="h6">{t('credit.title')}</Typography>
      {query.isLoading && <CircularProgress aria-label={t('credit.loading')} />}
      {(query.error || payment.error) && <Alert severity="error">{t('credit.error')}</Alert>}
      <Button onClick={() => void query.refetch()} disabled={payment.isPending}>
        {t('credit.refreshed')}
      </Button>
      {data && (
        <>
          <Typography>{t('credit.count', { count: data.noteCount })}</Typography>
          <Typography sx={{ fontWeight: 700 }}>
            {t('credit.debt')}: USD {formatDecimal(data.total)}
          </Typography>
          {!data.notes.length && <Typography>{t('credit.empty')}</Typography>}
          {data.notes.map((note) => (
            <Stack key={note.id} direction="row" sx={{ alignItems: 'center' }} spacing={1}>
              <Checkbox
                checked={selected.includes(note.id)}
                disabled={payment.isPending}
                slotProps={{
                  input: { 'aria-label': t('credit.select', { note: note.saleNumber }) },
                }}
                onChange={(_, checked) =>
                  setSelected((ids) =>
                    checked ? [...ids, note.id] : ids.filter((id) => id !== note.id),
                  )
                }
              />
              <Typography sx={{ flex: 1 }}>
                {note.saleNumber} · USD {formatDecimal(note.total)}
              </Typography>
              <Button onClick={() => setDetail(note.id)}>{t('credit.details')}</Button>
            </Stack>
          ))}
          {data.notes.length > 0 && (
            <>
              <Typography>
                {t('credit.selected')}: USD {formatDecimal(total)}
              </Typography>
              <TextField
                select
                label={t('sales.paymentMethod')}
                value={paymentMethod}
                disabled={payment.isPending}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {['CASH', 'BANK_TRANSFER', 'CHECK'].map((method) => (
                  <MenuItem key={method} value={method}>
                    {t(`payment.${method}`)}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                disabled={
                  !notes.length ||
                  notes.length > 100 ||
                  payment.isPending ||
                  query.isFetching ||
                  Boolean(query.error)
                }
                onClick={() => setConfirm(true)}
              >
                {t('credit.pay')}
              </Button>
            </>
          )}
          <Typography variant="h6">{t('credit.payments')}</Typography>
          {data.payments.map((p) => (
            <Stack key={p.id} direction="row" sx={{ alignItems: 'center' }} spacing={1}>
              <Typography sx={{ flex: 1 }}>
                {formatDateTime(p.createdAt)} · USD {formatDecimal(p.total)}
              </Typography>
              <Button onClick={() => setReceipt(p.id)}>{t('credit.receipt')}</Button>
            </Stack>
          ))}
        </>
      )}
      {detail && <SaleDetailDialog saleId={detail} onClose={() => setDetail(null)} />}
      <Dialog
        open={confirm}
        onClose={() => {
          if (!payment.isPending) setConfirm(false);
        }}
      >
        <DialogTitle>{t('credit.confirm')}</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography>{t('credit.confirmHelp', { total: formatDecimal(total) })}</Typography>
            {notes.map((n) => (
              <Typography key={n.id}>{n.saleNumber}</Typography>
            ))}
            <Typography>{t(`payment.${paymentMethod}`)}</Typography>
            {payment.error && <Alert severity="error">{t('credit.error')}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={payment.isPending} onClick={() => setConfirm(false)}>
            {t('credit.cancel')}
          </Button>
          <Button disabled={payment.isPending || !notes.length} onClick={() => payment.mutate()}>
            {t(payment.isPending ? 'credit.paying' : 'credit.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
      {receipt && (
        <Dialog open fullWidth maxWidth="sm" onClose={() => setReceipt(null)}>
          <DialogTitle>{t('credit.receipt')}</DialogTitle>
          <DialogContent>
            <DocumentCenter
              key={receipt}
              source={{
                documentType: 'CREDIT_RECEIPT',
                sourceType: 'CREDIT_PAYMENT',
                sourceId: receipt,
                sourceState: 'COMPLETED',
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReceipt(null)}>{t('common.close')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
}

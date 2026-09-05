import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CashCloseResource } from '@warehouse/contracts';
import { useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { ApiProblem } from '../../lib/api/problem.js';
import {
  PeriodControls,
  ResolvedBoundaries,
  localToday,
  reportingError,
  type PeriodKind,
} from './report-controls.js';

type CloseResponse = { data: CashCloseResource };
type CloseList = {
  data: CashCloseResource[];
  page: { hasNextPage: boolean; nextCursor: string | null };
};

export function CashClosePages() {
  const { t } = useTranslation();
  const administrator = useSession().user?.role === 'ADMINISTRATOR';
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('closeId');
  const [periodKind, setPeriodKind] = useState<PeriodKind>('DAY');
  const [anchorDate, setAnchorDate] = useState(localToday);
  const [cursor, setCursor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'create' | CashCloseResource | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const operationKeys = useRef(new Map<string, string>());
  const list = useQuery({
    queryKey: ['cash-closes', cursor],
    enabled: administrator,
    queryFn: () =>
      apiRequest<CloseList>(`/cash-closes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  });
  const detail = useQuery({
    queryKey: ['cash-close', selectedId],
    enabled: administrator && Boolean(selectedId),
    queryFn: () => apiRequest<CloseResponse>(`/cash-closes/${selectedId}`),
  });
  const mutation = useMutation({
    mutationFn: async (command: { path: string; body: object }) => {
      const fingerprint = JSON.stringify(command);
      const key = operationKeys.current.get(fingerprint) ?? crypto.randomUUID();
      operationKeys.current.set(fingerprint, key);
      const result = await apiRequest<CloseResponse>(command.path, {
        method: 'POST',
        body: command.body,
        idempotencyKey: key,
      });
      operationKeys.current.delete(fingerprint);
      return result;
    },
    onSuccess: (result) => {
      client.setQueryData(['cash-close', result.data.id], result);
      setParams({ closeId: result.data.id });
      setDialog(null);
      void client.invalidateQueries({ queryKey: ['cash-closes'] });
      if (result.data.supersedesCashCloseId)
        void client.invalidateQueries({
          queryKey: ['cash-close', result.data.supersedesCashCloseId],
        });
    },
    onError: (error) => {
      if (error instanceof ApiProblem && error.isConflict) setDialog(null);
    },
  });
  if (!administrator) return <Alert severity="error">{t('reports.forbidden')}</Alert>;
  const rows = list.data?.data ?? [];
  const selected = detail.data?.data;
  const number = (id: string) => rows.find((row) => row.id === id)?.closeNumber ?? id;
  const openCorrection = (row: CashCloseResource) => {
    mutation.reset();
    setReason('');
    setReasonError(false);
    setDialog(row);
  };
  function confirm() {
    if (dialog === 'create')
      mutation.mutate({ path: '/cash-closes', body: { periodKind, anchorDate } });
    else if (dialog) {
      if (!reason.trim()) {
        setReasonError(true);
        return;
      }
      mutation.mutate({
        path: `/cash-closes/${dialog.id}/corrections`,
        body: { reason: reason.trim() },
      });
    }
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        {t('reports.cashCloses')}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <PeriodControls
            periodKind={periodKind}
            anchorDate={anchorDate}
            onPeriodKind={setPeriodKind}
            onAnchorDate={setAnchorDate}
          />
          <Button
            variant="contained"
            disabled={!anchorDate || mutation.isPending}
            onClick={() => {
              mutation.reset();
              setDialog('create');
            }}
          >
            {t('reports.create')}
          </Button>
        </Stack>
      </Paper>
      {mutation.isError && <Alert severity="error">{reportingError(mutation.error, t)}</Alert>}
      <Button
        onClick={() => {
          void list.refetch();
        }}
      >
        {t('reports.refresh')}
      </Button>
      {list.isLoading && <CircularProgress aria-label={t('common.loading')} />}
      {list.isError && <Alert severity="error">{reportingError(list.error, t)}</Alert>}
      {!list.isLoading && !list.isError && rows.length === 0 && (
        <Typography>{t('reports.empty')}</Typography>
      )}
      {rows.length > 0 && (
        <TableContainer component={Paper}>
          <Table aria-label={t('reports.history')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('reports.cashCloses')}</TableCell>
                <TableCell>{t('common.date')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('reports.correctionReason')}</TableCell>
                <TableCell>{t('common.total')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.closeNumber}</TableCell>
                  <TableCell>
                    {row.anchorDate} · {t(`reports.${row.periodKind}`)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t(`reports.${row.status}`)}
                      color={row.status === 'CURRENT' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{row.correctionReason}</TableCell>
                  <TableCell>
                    {row.currencyCode} {row.grossTotal}
                  </TableCell>
                  <TableCell>
                    <Button onClick={() => setParams({ closeId: row.id })}>
                      {t('reports.view', { number: row.closeNumber })}
                    </Button>
                    {row.status === 'CURRENT' && (
                      <Button onClick={() => openCorrection(row)}>
                        {t('reports.correct', { number: row.closeNumber })}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Stack direction="row" spacing={2}>
        {cursor && <Button onClick={() => setCursor(null)}>{t('reports.first')}</Button>}
        {list.data?.page.hasNextPage && (
          <Button onClick={() => setCursor(list.data.page.nextCursor)}>{t('reports.next')}</Button>
        )}
      </Stack>
      {selectedId && detail.isLoading && <CircularProgress aria-label={t('common.loading')} />}
      {detail.isError && <Alert severity="error">{reportingError(detail.error, t)}</Alert>}
      {selected && (
        <Paper
          component="section"
          aria-label={selected.closeNumber}
          variant="outlined"
          sx={{ p: 2 }}
        >
          <Stack spacing={2}>
            <Typography variant="h5" component="h2">
              {selected.closeNumber}
            </Typography>
            <Chip label={t(`reports.${selected.status}`)} />
            <ResolvedBoundaries {...selected} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
              {(
                [
                  ['gross', selected.grossTotal],
                  ['partner', selected.partnerAmount],
                  ['remaining', selected.remainingAmount],
                ] as const
              ).map(([label, amount]) => (
                <Stack key={label}>
                  <Typography>{t(`reports.${label}`)}</Typography>
                  <Typography variant="h6">
                    {selected.currencyCode} {amount}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            {selected.lines.map((line) => (
              <Typography key={line.reportingGroup}>
                {t(`reports.${line.reportingGroup}`)}: {selected.currencyCode} {line.total}
              </Typography>
            ))}
            <Typography>
              {t('reports.createdBy')}: {selected.createdBy}
            </Typography>
            <Typography>
              {t('reports.createdAt')}: {selected.createdAt}
            </Typography>
            {selected.correctionReason && (
              <Typography>
                {t('reports.correctionReason')}: {selected.correctionReason}
              </Typography>
            )}
            {selected.supersedesCashCloseId && (
              <Link
                component={RouterLink}
                to={`/cash-closes?closeId=${selected.supersedesCashCloseId}`}
              >
                {t('reports.supersedes', { number: number(selected.supersedesCashCloseId) })}
              </Link>
            )}
            {selected.supersededByCashCloseId && (
              <Link
                component={RouterLink}
                to={`/cash-closes?closeId=${selected.supersededByCashCloseId}`}
              >
                {t('reports.supersededBy', { number: number(selected.supersededByCashCloseId) })}
              </Link>
            )}
            <Typography component="h3">{t('reports.sourceSales')}</Typography>
            {selected.contributingSaleIds.length === 0 && (
              <Typography>{t('reports.noSales')}</Typography>
            )}
            {selected.contributingSaleIds.map((id) => (
              <SaleSource key={id} id={id} />
            ))}
          </Stack>
        </Paper>
      )}
      <Dialog
        open={dialog !== null}
        onClose={() => {
          if (!mutation.isPending) setDialog(null);
        }}
        aria-labelledby="cash-close-dialog-title"
      >
        <DialogTitle id="cash-close-dialog-title">
          {t(dialog === 'create' ? 'reports.confirm' : 'reports.confirmCorrection')}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              {dialog === 'create'
                ? `${t(`reports.${periodKind}`)} · ${anchorDate}`
                : typeof dialog === 'object'
                  ? dialog?.closeNumber
                  : ''}
            </Typography>
            <Typography>{t('reports.closeNotice')}</Typography>
            {mutation.isError && (
              <Alert severity="error">{reportingError(mutation.error, t)}</Alert>
            )}
            {dialog !== 'create' && (
              <TextField
                label={t('reports.correctionReason')}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setReasonError(false);
                }}
                error={reasonError}
                helperText={reasonError ? t('reports.reasonRequired') : undefined}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={mutation.isPending} onClick={() => setDialog(null)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={mutation.isPending} onClick={confirm}>
            {t(dialog === 'create' ? 'reports.confirm' : 'reports.confirmCorrection')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function SaleSource({ id }: { id: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const sale = useQuery({
    queryKey: ['cash-close-sale', id],
    enabled: open,
    queryFn: () =>
      apiRequest<{
        data: {
          saleNumber: string;
          total: string;
          currencyCode: string;
          lines: Array<{
            sequence: number;
            productName: string;
            quantity: string;
            lineAmount: string;
          }>;
        };
      }>(`/sales/${id}`),
  });
  return (
    <Stack>
      <Button onClick={() => setOpen(!open)}>{t('reports.view', { number: id })}</Button>
      {open && sale.isLoading && <CircularProgress aria-label={t('common.loading')} />}
      {open && sale.isError && <Alert severity="error">{reportingError(sale.error, t)}</Alert>}
      {open && sale.data && (
        <Stack>
          <Typography>
            {sale.data.data.saleNumber}: {sale.data.data.currencyCode} {sale.data.data.total}
          </Typography>
          {sale.data.data.lines.map((line) => (
            <Typography key={line.sequence}>
              {line.productName} · {line.quantity} · {line.lineAmount}
            </Typography>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

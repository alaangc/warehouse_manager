import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
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
import { useMutation } from '@tanstack/react-query';
import type { ReportResource } from '@warehouse/contracts';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import {
  localToday,
  PeriodControls,
  reportingError,
  ResolvedBoundaries,
  type PeriodKind,
} from './report-controls.js';

type ReportType = ReportResource['reportType'];
function scalar(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
const reportPaths: Record<ReportType, string> = {
  SALES_BY_DRIVER: 'sales-by-driver',
  BEST_SELLING_PRODUCTS: 'best-selling-products',
  INVENTORY_BY_BRANCH: 'inventory-by-branch',
  FINANCIAL_SUMMARY: 'financial-summary',
};
const reportColumns: Record<ReportType, Array<[string, string]>> = {
  SALES_BY_DRIVER: [
    ['driverName', 'reports.driver'],
    ['saleCount', 'reports.saleCount'],
    ['total', 'common.total'],
  ],
  BEST_SELLING_PRODUCTS: [
    ['productName', 'common.product'],
    ['quantity', 'common.quantity'],
    ['total', 'common.total'],
  ],
  INVENTORY_BY_BRANCH: [
    ['branchName', 'reports.branch'],
    ['productName', 'common.product'],
    ['unitCode', 'reports.unit'],
    ['quantity', 'common.quantity'],
  ],
  FINANCIAL_SUMMARY: [
    ['reportingGroup', 'common.type'],
    ['total', 'common.total'],
  ],
};

export function ReportPages() {
  const { t } = useTranslation();
  const administrator = useSession().user?.role === 'ADMINISTRATOR';
  const [reportType, setReportType] = useState<ReportType>('BEST_SELLING_PRODUCTS');
  const [periodKind, setPeriodKind] = useState<PeriodKind>('DAY');
  const [anchorDate, setAnchorDate] = useState(localToday);
  const [invalid, setInvalid] = useState(false);
  const snapshotKey = useRef<string | null>(null);
  const report = useMutation({
    mutationFn: (input: { reportType: ReportType; periodKind: PeriodKind; anchorDate: string }) => {
      const query = new URLSearchParams({
        periodKind: input.periodKind,
        anchorDate: input.anchorDate,
      });
      return apiRequest<{ data: ReportResource }>(
        `/reports/${reportPaths[input.reportType]}${input.reportType === 'INVENTORY_BY_BRANCH' ? '' : `?${query}`}`,
      );
    },
  });
  const snapshot = useMutation({
    mutationFn: (result: ReportResource) => {
      snapshotKey.current ??= crypto.randomUUID();
      return apiRequest<{ data: { id: string } }>('/report-snapshots', {
        method: 'POST',
        idempotencyKey: snapshotKey.current,
        body: {
          reportType: result.reportType,
          filters:
            result.reportType === 'INVENTORY_BY_BRANCH'
              ? {}
              : { periodKind: result.filters.periodKind, anchorDate: result.filters.anchorDate },
        },
      });
    },
  });
  if (!administrator) return <Alert severity="error">{t('reports.forbidden')}</Alert>;
  const result = report.data?.data;
  const currency =
    typeof result?.totals?.currencyCode === 'string' ? result.totals.currencyCode : 'MXN';
  function runReport() {
    if (reportType !== 'INVENTORY_BY_BRANCH' && !anchorDate) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    snapshot.reset();
    snapshotKey.current = null;
    report.mutate({ reportType, periodKind, anchorDate });
  }
  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        {t('reports.title')}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            select
            label={t('reports.reportType')}
            value={reportType}
            onChange={(event) => setReportType(event.target.value as ReportType)}
          >
            {(Object.keys(reportPaths) as ReportType[]).map((type) => (
              <MenuItem key={type} value={type}>
                {t(`reports.${type}`)}
              </MenuItem>
            ))}
          </TextField>
          {reportType !== 'INVENTORY_BY_BRANCH' && (
            <PeriodControls
              periodKind={periodKind}
              anchorDate={anchorDate}
              onPeriodKind={setPeriodKind}
              onAnchorDate={setAnchorDate}
            />
          )}
          <Button
            variant="contained"
            disabled={report.isPending || snapshot.isPending}
            onClick={runReport}
          >
            {t('reports.run')}
          </Button>
        </Stack>
      </Paper>
      {report.isPending && <CircularProgress aria-label={t('common.loading')} />}
      {invalid && <Alert severity="error">{t('reports.periodInvalid')}</Alert>}
      {report.isError && <Alert severity="error">{reportingError(report.error, t)}</Alert>}
      {result && !report.isPending && !report.isError && !invalid && (
        <Stack spacing={2}>
          <Typography variant="h5" component="h2">
            {t(`reports.${result.reportType}`)}
          </Typography>
          {typeof result.filters.periodStart === 'string' &&
          typeof result.filters.periodEnd === 'string' ? (
            <ResolvedBoundaries
              periodStart={result.filters.periodStart}
              periodEnd={result.filters.periodEnd}
              businessTimezone={result.businessTimezone}
            />
          ) : (
            <Typography>{result.businessTimezone}</Typography>
          )}
          {result.totals && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
              {(
                [
                  ['gross', 'grossTotal'],
                  ['partner', 'partnerAmount'],
                  ['remaining', 'remainingAmount'],
                ] as const
              )
                .filter(([, key]) => typeof result.totals?.[key] === 'string')
                .map(([label, key]) => (
                  <Stack key={key}>
                    <Typography>{t(`reports.${label}`)}</Typography>
                    <Typography variant="h6">
                      {currency} {String(result.totals![key])}
                    </Typography>
                  </Stack>
                ))}
            </Stack>
          )}
          {result.rows.length === 0 ? (
            <Typography>{t('reports.noActivity')}</Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table aria-label={t('reports.table', { type: t(`reports.${result.reportType}`) })}>
                <TableHead>
                  <TableRow>
                    {reportColumns[result.reportType].map(([key, label]) => (
                      <TableCell key={key}>{t(label)}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.rows.map((row, index) => (
                    <TableRow key={index}>
                      {reportColumns[result.reportType].map(([key]) => (
                        <TableCell key={key}>
                          {key === 'reportingGroup'
                            ? t(`reports.${String(row[key])}`)
                            : key === 'total'
                              ? `${currency} ${scalar(row[key])}`
                              : scalar(row[key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Button
            disabled={snapshot.isPending || snapshot.isSuccess}
            onClick={() => snapshot.mutate(result)}
          >
            {t('reports.saveSnapshot')}
          </Button>
          {snapshot.isError && <Alert severity="error">{reportingError(snapshot.error, t)}</Alert>}
          {snapshot.isSuccess && (
            <Alert severity="success">
              {t('reports.snapshotSaved', { id: snapshot.data.data.id })}
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  );
}

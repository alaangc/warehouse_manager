import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { currentLocale } from '../../i18n/index.js';
import { ApiProblem } from '../../lib/api/problem.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

export type PeriodKind = 'DAY' | 'WEEK' | 'MONTH';
export function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function PeriodControls({
  periodKind,
  anchorDate,
  onPeriodKind,
  onAnchorDate,
}: {
  periodKind: PeriodKind;
  anchorDate: string;
  onPeriodKind: (kind: PeriodKind) => void;
  onAnchorDate: (date: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <TextField
        select
        label={t('reports.periodKind')}
        value={periodKind}
        onChange={(event) => onPeriodKind(event.target.value as PeriodKind)}
        sx={{ minWidth: 160 }}
      >
        {(['DAY', 'WEEK', 'MONTH'] as const).map((kind) => (
          <MenuItem key={kind} value={kind}>
            {t(`reports.${kind}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="date"
        label={t('reports.anchorDate')}
        value={anchorDate}
        onChange={(event) => onAnchorDate(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </Stack>
  );
}
export function ResolvedBoundaries({
  periodStart,
  periodEnd,
  businessTimezone,
}: {
  periodStart: string;
  periodEnd: string;
  businessTimezone: string;
}) {
  const { t } = useTranslation();
  const format = (value: string) =>
    new Intl.DateTimeFormat(currentLocale(), {
      timeZone: businessTimezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  return (
    <Stack spacing={0.5}>
      <Typography>{businessTimezone}</Typography>
      <Typography>
        {t('reports.start')}: {format(periodStart)}
      </Typography>
      <Typography>
        {t('reports.end')}: {format(periodEnd)}
      </Typography>
    </Stack>
  );
}
export function reportingError(error: unknown, t: TFunction) {
  if (error instanceof ApiProblem) {
    const keys: Record<string, string> = {
      CASH_CLOSE_NOT_CURRENT: 'stale',
      CASH_CLOSE_PERIOD_ALREADY_CURRENT: 'duplicate',
      IDEMPOTENCY_KEY_REUSED: 'reused',
      INVALID_REPORTING_PERIOD: 'periodInvalid',
    };
    if (error.code && keys[error.code]) return t(`reports.${keys[error.code]}`);
  }
  return localizedErrorMessage(error, t);
}

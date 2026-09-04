import { Temporal } from '@js-temporal/polyfill';

export const REPORTING_PERIOD_KINDS = ['DAY', 'WEEK', 'MONTH'] as const;
export type ReportingPeriodKind = (typeof REPORTING_PERIOD_KINDS)[number];

export interface ReportingPeriodInput {
  periodKind: ReportingPeriodKind;
  anchorDate: string;
  businessTimezone: string;
}

export interface ResolvedReportingPeriod extends ReportingPeriodInput {
  periodStart: string;
  periodEnd: string;
}

export class ReportingPeriodError extends Error {
  readonly code = 'INVALID_REPORTING_PERIOD';
}

function invalidPeriod(cause?: unknown): ReportingPeriodError {
  return Object.assign(new ReportingPeriodError('The reporting period is invalid.'), { cause });
}

export function resolveReportingPeriod(input: ReportingPeriodInput): ResolvedReportingPeriod {
  if (
    !REPORTING_PERIOD_KINDS.includes(input.periodKind) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.anchorDate)
  ) {
    throw invalidPeriod();
  }
  try {
    const anchor = Temporal.PlainDate.from(input.anchorDate);
    const periodStartDate =
      input.periodKind === 'WEEK'
        ? anchor.subtract({ days: anchor.dayOfWeek - 1 })
        : input.periodKind === 'MONTH'
          ? anchor.with({ day: 1 })
          : anchor;
    const periodEndDate = periodStartDate.add(
      input.periodKind === 'DAY'
        ? { days: 1 }
        : input.periodKind === 'WEEK'
          ? { weeks: 1 }
          : { months: 1 },
    );
    const periodStart = periodStartDate
      .toZonedDateTime({ timeZone: input.businessTimezone, plainTime: '00:00' })
      .toInstant();
    const periodEnd = periodEndDate
      .toZonedDateTime({ timeZone: input.businessTimezone, plainTime: '00:00' })
      .toInstant();
    return {
      ...input,
      periodStart: periodStart.toString(),
      periodEnd: periodEnd.toString(),
    };
  } catch (error) {
    throw invalidPeriod(error);
  }
}

export function isWithinReportingPeriod(
  instant: string,
  period: Pick<ResolvedReportingPeriod, 'periodStart' | 'periodEnd'>,
): boolean {
  const candidate = Temporal.Instant.from(instant);
  const start = Temporal.Instant.from(period.periodStart);
  const end = Temporal.Instant.from(period.periodEnd);
  return (
    Temporal.Instant.compare(candidate, start) >= 0 && Temporal.Instant.compare(candidate, end) < 0
  );
}

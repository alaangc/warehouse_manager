import { describe, expect, it } from 'vitest';
import {
  isWithinReportingPeriod,
  resolveReportingPeriod,
} from '../../../src/modules/reports/reporting-period.js';

describe('reporting period resolution', () => {
  it('resolves DAY from local midnight through the next local midnight', () => {
    expect(
      resolveReportingPeriod({
        periodKind: 'DAY',
        anchorDate: '2026-09-04',
        businessTimezone: 'America/Hermosillo',
      }),
    ).toEqual({
      periodKind: 'DAY',
      anchorDate: '2026-09-04',
      businessTimezone: 'America/Hermosillo',
      periodStart: '2026-09-04T07:00:00Z',
      periodEnd: '2026-09-05T07:00:00Z',
    });
  });

  it('resolves WEEK from Monday local midnight through the next Monday', () => {
    const period = resolveReportingPeriod({
      periodKind: 'WEEK',
      anchorDate: '2026-09-06',
      businessTimezone: 'America/Hermosillo',
    });
    expect(period).toMatchObject({
      periodStart: '2026-08-31T07:00:00Z',
      periodEnd: '2026-09-07T07:00:00Z',
    });
  });

  it('resolves MONTH from the first local midnight through the next calendar month', () => {
    const period = resolveReportingPeriod({
      periodKind: 'MONTH',
      anchorDate: '2026-09-30',
      businessTimezone: 'America/Hermosillo',
    });
    expect(period).toMatchObject({
      periodStart: '2026-09-01T07:00:00Z',
      periodEnd: '2026-10-01T07:00:00Z',
    });
  });

  it('includes the exact start and excludes the exact end', () => {
    const period = resolveReportingPeriod({
      periodKind: 'DAY',
      anchorDate: '2026-09-04',
      businessTimezone: 'America/Hermosillo',
    });
    expect(isWithinReportingPeriod('2026-09-04T07:00:00Z', period)).toBe(true);
    expect(isWithinReportingPeriod('2026-09-05T06:59:59.999999999Z', period)).toBe(true);
    expect(isWithinReportingPeriod('2026-09-05T07:00:00Z', period)).toBe(false);
    expect(isWithinReportingPeriod('2026-09-04T06:59:59.999999999Z', period)).toBe(false);
  });

  it('resolves both boundaries independently across 23-hour and 25-hour offset transitions', () => {
    const springForward = resolveReportingPeriod({
      periodKind: 'DAY',
      anchorDate: '2026-03-08',
      businessTimezone: 'America/New_York',
    });
    const fallBack = resolveReportingPeriod({
      periodKind: 'DAY',
      anchorDate: '2026-11-01',
      businessTimezone: 'America/New_York',
    });
    expect(springForward).toMatchObject({
      periodStart: '2026-03-08T05:00:00Z',
      periodEnd: '2026-03-09T04:00:00Z',
    });
    expect(fallBack).toMatchObject({
      periodStart: '2026-11-01T04:00:00Z',
      periodEnd: '2026-11-02T05:00:00Z',
    });
    expect(
      (Date.parse(springForward.periodEnd) - Date.parse(springForward.periodStart)) / 3_600_000,
    ).toBe(23);
    expect((Date.parse(fallBack.periodEnd) - Date.parse(fallBack.periodStart)) / 3_600_000).toBe(
      25,
    );
  });

  it.each([
    { periodKind: 'YEAR', anchorDate: '2026-09-04', businessTimezone: 'America/Hermosillo' },
    { periodKind: 'DAY', anchorDate: '09/04/2026', businessTimezone: 'America/Hermosillo' },
    { periodKind: 'DAY', anchorDate: '2026-02-30', businessTimezone: 'America/Hermosillo' },
    { periodKind: 'DAY', anchorDate: '2026-09-04', businessTimezone: 'Mars/Olympus' },
  ])('rejects invalid period input %#', (input) => {
    expect(() => resolveReportingPeriod(input as never)).toThrow(
      expect.objectContaining({ code: 'INVALID_REPORTING_PERIOD' }),
    );
  });
});

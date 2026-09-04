import type { Page } from '@playwright/test';
import { expect, test } from './support/test-fixtures.js';

const password = 'development-password-change-me';

type PeriodKind = 'DAY' | 'WEEK' | 'MONTH';

interface ApiEnvelope<T> {
  data: T;
}

interface Problem {
  code: string;
  detail: string;
  status: number;
}

interface CashClose {
  id: string;
  closeNumber: string;
  periodKind: PeriodKind;
  anchorDate: string;
  periodStart: string;
  periodEnd: string;
  businessTimezone: string;
  status: 'CURRENT' | 'SUPERSEDED';
  supersedesCashCloseId: string | null;
  supersededByCashCloseId: string | null;
  correctionReason: string | null;
  grossTotal: string;
  partnerRate: string;
  partnerAmount: string;
  remainingAmount: string;
  lines: Array<{ reportingGroup: string; total: string }>;
  contributingSaleIds: string[];
}

interface Report {
  businessTimezone: string;
  filters: {
    periodKind: PeriodKind;
    anchorDate: string;
    periodStart: string;
    periodEnd: string;
  };
  totals: Record<string, string>;
}

interface ApiResult<T> {
  status: number;
  body: ApiEnvelope<T> | Problem;
}

async function login(page: Page): Promise<string> {
  await page.addInitScript(() => {
    window.localStorage.setItem('warehouse-manager-language', 'en');
  });
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.locator('input[name="password"]').fill(password);
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/login' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  return response.headers()['x-csrf-token']!;
}

async function apiRequest<T>(
  page: Page,
  csrfToken: string,
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    data: options.body,
    headers: {
      Origin: new URL(page.url()).origin,
      ...(method === 'POST' ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
  });
  return {
    status: response.status(),
    body: (await response.json()) as ApiEnvelope<T> | Problem,
  };
}

function successfulData<T>(result: ApiResult<T>, expectedStatus = 200): T {
  expect(result.status).toBe(expectedStatus);
  expect('data' in result.body).toBe(true);
  return (result.body as ApiEnvelope<T>).data;
}

function expectProblem<T>(result: ApiResult<T>, status: number, code: string): void {
  expect(result.status).toBe(status);
  expect(result.body).toMatchObject({ status, code });
}

function randomAnchorDate(): string {
  const bytes = crypto.getRandomValues(new Uint16Array(2));
  const year = 2100 + (bytes[0]! % 7000);
  const month = 1 + (bytes[1]! % 12);
  const day = 4 + (bytes[0]! % 20);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function expectedBoundaries(kind: PeriodKind, anchorDate: string) {
  const anchor = new Date(`${anchorDate}T12:00:00Z`);
  let startDate = anchorDate;
  let endDate: string;

  if (kind === 'DAY') {
    endDate = addDays(anchorDate, 1);
  } else if (kind === 'WEEK') {
    const daysSinceMonday = (anchor.getUTCDay() + 6) % 7;
    startDate = addDays(anchorDate, -daysSinceMonday);
    endDate = addDays(startDate, 7);
  } else {
    startDate = `${anchorDate.slice(0, 7)}-01`;
    const nextMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1, 12));
    endDate = nextMonth.toISOString().slice(0, 10);
  }

  return {
    periodStart: `${startDate}T07:00:00Z`,
    periodEnd: `${endDate}T07:00:00Z`,
  };
}

function idempotencyKey(label: string): string {
  return `e2e-reporting-${label}-${crypto.randomUUID()}`;
}

test('calendar reports and immutable cash-close currentness remain reproducible', async ({
  administratorPage,
}) => {
  test.skip(!process.env.E2E_BASE_URL, 'Set E2E_BASE_URL to run against the isolated full stack.');

  const csrfToken = await login(administratorPage);
  const anchorDate = randomAnchorDate();

  for (const periodKind of ['DAY', 'WEEK', 'MONTH'] as const) {
    const report = successfulData(
      await apiRequest<Report>(
        administratorPage,
        csrfToken,
        'GET',
        `/reports/financial-summary?periodKind=${periodKind}&anchorDate=${anchorDate}`,
      ),
    );
    expect(report.businessTimezone).toBe('America/Hermosillo');
    expect(report.filters).toMatchObject({
      periodKind,
      anchorDate,
      ...expectedBoundaries(periodKind, anchorDate),
    });
  }

  const createBody = { periodKind: 'DAY', anchorDate };
  const createKey = idempotencyKey('create');
  const createdResult = await apiRequest<CashClose>(
    administratorPage,
    csrfToken,
    'POST',
    '/cash-closes',
    { body: createBody, idempotencyKey: createKey },
  );
  const created = successfulData(createdResult, 201);
  expect(created).toMatchObject({
    periodKind: 'DAY',
    anchorDate,
    status: 'CURRENT',
    supersedesCashCloseId: null,
    partnerRate: '0.500000',
  });
  expect(created.lines.map((line) => line.reportingGroup)).toEqual([
    'SODAS',
    'CHARCOAL',
    'TOSTADAS',
    'OTHER',
  ]);

  const replay = successfulData(
    await apiRequest<CashClose>(administratorPage, csrfToken, 'POST', '/cash-closes', {
      body: createBody,
      idempotencyKey: createKey,
    }),
    201,
  );
  expect(replay).toEqual(created);

  expectProblem(
    await apiRequest<CashClose>(administratorPage, csrfToken, 'POST', '/cash-closes', {
      body: createBody,
      idempotencyKey: idempotencyKey('duplicate'),
    }),
    409,
    'CASH_CLOSE_PERIOD_ALREADY_CURRENT',
  );

  const concurrentDate = addDays(anchorDate, 2);
  const concurrentCreates = await Promise.all([
    apiRequest<CashClose>(administratorPage, csrfToken, 'POST', '/cash-closes', {
      body: { periodKind: 'DAY', anchorDate: concurrentDate },
      idempotencyKey: idempotencyKey('race-a'),
    }),
    apiRequest<CashClose>(administratorPage, csrfToken, 'POST', '/cash-closes', {
      body: { periodKind: 'DAY', anchorDate: concurrentDate },
      idempotencyKey: idempotencyKey('race-b'),
    }),
  ]);
  expect(concurrentCreates.map((result) => result.status).sort()).toEqual([201, 409]);
  expectProblem(
    concurrentCreates.find((result) => result.status === 409)!,
    409,
    'CASH_CLOSE_PERIOD_ALREADY_CURRENT',
  );

  const corrections = await Promise.all([
    apiRequest<CashClose>(
      administratorPage,
      csrfToken,
      'POST',
      `/cash-closes/${created.id}/corrections`,
      { body: { reason: 'Late transaction A' }, idempotencyKey: idempotencyKey('correction-a') },
    ),
    apiRequest<CashClose>(
      administratorPage,
      csrfToken,
      'POST',
      `/cash-closes/${created.id}/corrections`,
      { body: { reason: 'Late transaction B' }, idempotencyKey: idempotencyKey('correction-b') },
    ),
  ]);
  expect(corrections.map((result) => result.status).sort()).toEqual([201, 409]);
  expectProblem(
    corrections.find((result) => result.status === 409)!,
    409,
    'CASH_CLOSE_NOT_CURRENT',
  );
  const corrected = successfulData(
    corrections.find((result) => result.status === 201)!,
    201,
  );
  expect(corrected).toMatchObject({
    periodKind: created.periodKind,
    anchorDate: created.anchorDate,
    periodStart: created.periodStart,
    periodEnd: created.periodEnd,
    status: 'CURRENT',
    supersedesCashCloseId: created.id,
  });

  const preservedOriginal = successfulData(
    await apiRequest<CashClose>(administratorPage, csrfToken, 'GET', `/cash-closes/${created.id}`),
  );
  expect(preservedOriginal).toEqual({
    ...created,
    status: 'SUPERSEDED',
    supersededByCashCloseId: corrected.id,
  });
  const reproducedSuccessor = successfulData(
    await apiRequest<CashClose>(
      administratorPage,
      csrfToken,
      'GET',
      `/cash-closes/${corrected.id}`,
    ),
  );
  expect(reproducedSuccessor).toEqual(corrected);

  await administratorPage.goto('/cash-closes');
  await expect(
    administratorPage.getByRole('row', { name: new RegExp(corrected.closeNumber) }),
  ).toContainText('Current');
  await administratorPage.goto('/reports');
  await administratorPage.getByLabel('Anchor date').fill(anchorDate);
  await administratorPage.getByRole('button', { name: 'Run report' }).click();
  await expect(administratorPage.getByText('America/Hermosillo')).toBeVisible();
});

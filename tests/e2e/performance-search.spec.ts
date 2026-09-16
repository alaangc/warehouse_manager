import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { cpus, totalmem, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  startPerformanceFixture,
  performancePassword,
  performanceSeed,
} from './support/performance-fixture.js';

const views = [
  {
    name: 'products',
    path: '/catalog',
    label: 'Search products',
    scope: 'table[aria-label="Products"]',
    empty: 'No records found.',
    endpoint: '/products',
  },
  {
    name: 'customers',
    path: '/customers',
    label: 'Search customers',
    scope: '[role="region"][aria-label="Customer directory"]',
    empty: 'No customers match these filters.',
    endpoint: '/customers',
  },
  {
    name: 'inventory',
    path: '/inventory',
    label: 'Search product or location',
    scope: 'table[aria-label="Inventory balances"]',
    empty: 'No inventory balances match these filters.',
    endpoint: '/inventory/balances',
  },
] as const;
type Sample = {
  user: number;
  kind: string;
  match: boolean;
  query: string;
  elapsedMs: number;
  startedAt: number;
  conditions: boolean[];
};

async function search(page: Page, user: number, step: number, warm: boolean): Promise<Sample> {
  const viewIndex = (Math.floor(step / (warm ? 2 : 6)) + user) % 3;
  const view = views[viewIndex]!;
  if (new URL(page.url()).pathname !== view.path) {
    await page.goto(view.path);
    await expect(page.locator(view.scope)).toHaveAttribute('aria-busy', 'false');
  }
  const match = step % 2 === 0;
  const number = 1 + ((user * 379 + step * 127 + (warm ? 5000 : 0)) % 10000);
  const suffix = String(number).padStart(5, '0');
  const query = match
    ? `${view.name === 'customers' ? 'Customer' : 'Product'} ${suffix}`
    : `Missing-${warm ? 'warm' : 'measure'}-${user}-${step}`;
  const expected =
    view.name === 'products'
      ? [query, `SKU-${suffix}`, '10.0000', 'Active']
      : view.name === 'customers'
        ? [query, `CUS-${suffix}`, 'Magdalena', 'Active']
        : [
            query,
            `00000000-0000-4000-8000-04${String(number).padStart(10, '0')}`,
            'Magdalena',
            'PERF-ROUTE',
            '50.000',
            '40.000',
            'Available',
          ];
  await page.getByLabel(view.label, { exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(
    ({ scope, match, expected, empty, query }) => {
      const state = window as unknown as {
        measurement?: { result?: { elapsedMs: number; startedAt: number; conditions: boolean[] } };
      };
      state.measurement = {};
      document.addEventListener(
        'input',
        function begin(event) {
          if (!(event.target instanceof HTMLInputElement) || event.target.value !== query) return;
          document.removeEventListener('input', begin, true);
          const start = performance.now();
          let readyFrames = 0;
          const visible = (element: Element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none'
            );
          };
          const check = () => {
            const root = document.querySelector(scope);
            const text = root?.textContent ?? '';
            const rows = root
              ? [...root.querySelectorAll('tbody tr')].filter((row) =>
                  row.textContent?.includes(query),
                )
              : [];
            const actions = root ? [...root.querySelectorAll('button, a[href]')] : [];
            const conditions = [
              root?.getAttribute('aria-busy') === 'false' &&
                !document.querySelector('[role="progressbar"]'),
              Boolean(
                root &&
                visible(root) &&
                (match
                  ? rows.length > 0 || actions.some((action) => action.textContent?.includes(query))
                  : text.includes(empty)),
              ),
              match
                ? expected.every(
                    (value) =>
                      root &&
                      [...root.querySelectorAll('td, p, span, button')].some(
                        (element) => visible(element) && element.textContent?.includes(value),
                      ),
                  )
                : text.includes(empty) && rows.length === 0,
              match
                ? actions.length > 0 &&
                  actions.every(
                    (action) =>
                      visible(action) && !action.matches(':disabled, [aria-disabled="true"]'),
                  )
                : actions.length === 0,
            ];
            readyFrames = conditions.every(Boolean) ? readyFrames + 1 : 0;
            if (readyFrames === 2) {
              state.measurement!.result = {
                elapsedMs: performance.now() - start,
                startedAt: performance.timeOrigin + start,
                conditions,
              };
              return;
            }
            requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        },
        true,
      );
    },
    { scope: view.scope, match, expected, empty: view.empty, query },
  );
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/v1${view.endpoint}` && url.searchParams.get('search') === query;
  });
  await page.getByLabel(view.label, { exact: true }).fill(query);
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await page.waitForFunction(
    () => (window as unknown as { measurement?: { result?: unknown } }).measurement?.result,
    undefined,
    { timeout: 30000 },
  );
  const result = await page.evaluate(
    () =>
      (
        window as unknown as {
          measurement: { result: { elapsedMs: number; startedAt: number; conditions: boolean[] } };
        }
      ).measurement.result,
  );
  expect(result.conditions).toEqual([true, true, true, true]);
  if (match) {
    const actions = page.locator(view.scope).locator('button, a[href]');
    for (const action of await actions.all()) await expect(action).toBeEnabled();
  } else await expect(page.locator(view.scope)).toContainText(view.empty);
  return { user, kind: view.name, match, query, ...result };
}

test('SC-006: 25 authenticated sessions complete 450 warmed searches', async ({
  browser,
}, testInfo) => {
  const fixture = await startPerformanceFixture();
  const contexts: BrowserContext[] = [];
  const samples: Sample[] = [];
  const errors: string[] = [];
  try {
    const pages: Page[] = [];
    // Authentication and initial bundle compilation/rendering are outside search timing.
    for (let user = 0; user < 25; user++) {
      const context = await browser.newContext({
        baseURL: fixture.origin,
        viewport: { width: 1440, height: 1000 },
        extraHTTPHeaders: { 'X-Forwarded-For': `198.51.100.${user + 1}` },
      });
      contexts.push(context);
      await context.addInitScript(() => localStorage.setItem('warehouse-manager-language', 'en'));
      const login = await context.request.post('/api/v1/auth/login', {
        headers: { Origin: fixture.origin },
        data: { username: `perf-${user}`, password: performancePassword },
      });
      expect(login.status()).toBe(200);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/inventory');
      await expect(page.getByLabel('Search product or location')).toBeVisible();
      pages.push(page);
    }
    for (let step = 0; step < 6; step++)
      await Promise.all(pages.map((page, user) => search(page, user, step, true)));
    const measuredAt = new Date().toISOString();
    for (let step = 0; step < 18; step++) {
      samples.push(
        ...(await Promise.all(pages.map((page, user) => search(page, user, step, false)))),
      );
      if (step >= 16)
        for (let user = 0; user < 3; user++)
          await pages[user]!.screenshot({
            path: testInfo.outputPath(`search-${user}-${step % 2 ? 'empty' : 'matching'}.png`),
            fullPage: true,
          });
      process.stdout.write(`Measured ${samples.length}/450 searches\n`);
    }
    await pages[0]!.screenshot({ path: testInfo.outputPath('search-results.png'), fullPage: true });
    const sorted = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.ceil(sorted.length * p) - 1];
    const passed = samples.filter((sample) => sample.elapsedMs <= 2000).length;
    const mix = Object.fromEntries(
      views.flatMap((view) =>
        [true, false].map((match) => [
          `${view.name}-${match ? 'matching' : 'empty'}`,
          samples.filter((sample) => sample.kind === view.name && sample.match === match).length,
        ]),
      ),
    );
    const report = {
      seed: performanceSeed,
      sourceHashes: Object.fromEntries(
        await Promise.all(
          [
            'tests/e2e/support/performance-fixture.ts',
            'tests/e2e/performance-search.spec.ts',
            'apps/web/dist/index.html',
            'apps/api/src/modules/inventory/inventory-routes.ts',
          ].map(async (path) => [
            path,
            createHash('sha256')
              .update(await readFile(path))
              .digest('hex'),
          ]),
        ),
      ),
      measuredAt,
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: Boolean(execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim()),
      counts: fixture.counts,
      users: 25,
      role: 'ADMINISTRATOR',
      warmupActions: 150,
      measuredActions: samples.length,
      mix,
      environment: {
        os: `${platform()} ${release()}`,
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
        memoryBytes: totalmem(),
        node: process.version,
        browser: browser.version(),
        postgres: fixture.postgresVersion,
        frontend: 'Vite production build',
        network: 'loopback; 25 distinct trusted-proxy client IPs; rate limits enabled',
        packageManager: JSON.parse(await readFile('package.json', 'utf8')).packageManager,
      },
      timing:
        'Captured input event through two animation frames with all four DOM predicates true; navigation and warmup excluded; fresh search query per action; no response mocks.',
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: sorted.at(-1),
      passed,
      passRate: passed / samples.length,
      errors,
      samples,
    };
    await writeFile(
      testInfo.outputPath('search-performance.json'),
      JSON.stringify(report, null, 2),
    );
    await testInfo.attach('search-performance', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    expect(samples).toHaveLength(450);
    expect(Object.values(mix)).toEqual([75, 75, 75, 75, 75, 75]);
    expect(errors).toEqual([]);
    expect(passed, 'SC-006 requires at least 95% at or below 2 seconds').toBeGreaterThanOrEqual(
      428,
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.close();
  }
});

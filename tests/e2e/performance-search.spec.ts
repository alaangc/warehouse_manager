import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import {
  createPerformanceFixture,
  PERFORMANCE_USERS,
  SEARCH_ROUNDS,
  searchAction,
  performanceId,
  summarizeSearch,
  type SearchMeasurement,
} from './support/performance-fixture.js';
import { searchCompletion } from './support/search-completion.js';

test('SC-006: 25 authenticated users complete 450 warmed visible searches', async ({
  browser,
}, testInfo) => {
  const fixture = await createPerformanceFixture();
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const measured: SearchMeasurement[] = [];
  const warmup: SearchMeasurement[] = [];
  const startedAt = new Date().toISOString();
  try {
    const pages = await Promise.all(
      Array.from({ length: PERFORMANCE_USERS }, async (_, user) => {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          locale: 'en-US',
          extraHTTPHeaders: { 'X-Performance-Client': String(user + 1) },
        });
        contexts.push(context);
        await context.addInitScript(() => localStorage.setItem('warehouse-manager-language', 'en'));
        const login = await context.request.post(`${fixture.origin}/api/v1/auth/login`, {
          headers: { Origin: fixture.origin },
          data: { username: `perf-${user + 1}`, password: 'development-password-change-me' },
        });
        expect(login.status()).toBe(200);
        expect((await login.json()).data.id).toBe(performanceId('user', user + 1));
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        return page;
      }),
    );
    expect(
      new Set(
        await Promise.all(
          contexts.map(
            async (context) =>
              (await context.cookies(fixture.origin)).find((cookie) => cookie.name === 'wm_session')
                ?.value,
          ),
        ),
      ).size,
    ).toBe(25);

    async function search(page: Page, user: number, round: number): Promise<SearchMeasurement> {
      const action = searchAction(user, round);
      const labels = {
        products: ['/catalog', 'Search products', 'Products', '/api/v1/products'],
        customers: ['/customers', 'Search customers', 'Customer directory', '/api/v1/customers'],
        inventory: [
          '/inventory',
          'Search product or location',
          'Inventory balances',
          '/api/v1/inventory/balances',
        ],
      };
      const [path, label, regionName, endpoint] = labels[action.kind];
      let start = 0;
      try {
        // Navigation/initial data load is preparation, not the search action.
        await page.goto(`${fixture.origin}${path}`);
        const input = page.getByLabel(label!, { exact: true });
        await expect(input).toBeVisible();
        const region =
          action.kind === 'customers'
            ? page.getByRole('region', { name: regionName, exact: true })
            : page.getByRole('table', { name: regionName, exact: true });
        await expect(region).toHaveAttribute('aria-busy', 'false');
        const response = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname === endpoint && url.searchParams.get('search') === action.query;
        });
        start = await page.evaluate(() => performance.now());
        const [resultResponse] = await Promise.all([response, input.fill(action.query)]);
        expect(resultResponse.status()).toBe(200);
        await region.scrollIntoViewIfNeeded();
        const done = await page.waitForFunction(
          searchCompletion,
          { ...action, productId: performanceId('product', action.number) },
          { timeout: 15_000 },
        );
        const result = await done.jsonValue();
        if (!result) throw new Error('Incomplete search');
        expect(result.checks).toEqual({
          loadingEnded: true,
          visibleResult: true,
          identifyingValues: true,
          enabledActions: true,
        });
        return { user, round, ...action, elapsedMs: result.finishedAt - start, complete: true };
      } catch (error) {
        const end = await page.evaluate(() => performance.now()).catch(() => start + 15_000);
        return {
          user,
          round,
          ...action,
          elapsedMs: start ? end - start : 15_000,
          complete: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    await Promise.all(
      pages.map(async (page, user) => {
        for (let round = SEARCH_ROUNDS; round < SEARCH_ROUNDS + 6; round++)
          warmup.push(await search(page, user, round));
      }),
    );
    // All 25 users finish warm-up before the common measurement start barrier.
    const measurementStartedAt = new Date().toISOString();
    await Promise.all(
      pages.map(async (page, user) => {
        for (let round = 0; round < SEARCH_ROUNDS; round++)
          measured.push(await search(page, user, round));
      }),
    );
    const summary = summarizeSearch(measured);
    const mix = Object.fromEntries(
      ['products', 'customers', 'inventory'].flatMap((kind) =>
        [true, false].map((matches) => {
          const samples = measured.filter(
            (sample) => sample.kind === kind && sample.matches === matches,
          );
          return [`${kind}:${matches ? 'matching' : 'no-results'}`, summarizeSearch(samples)];
        }),
      ),
    );
    const report = {
      startedAt,
      measurementStartedAt,
      endedAt: new Date().toISOString(),
      ...fixture.metadata,
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      revisionIncludesUncommittedChanges:
        execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
      browser: browser.version(),
      users: 25,
      warmupActions: 150,
      measuredActions: 450,
      thresholdMs: 2000,
      retries: 0,
      timing:
        'Browser performance.now before fill through simultaneous four-condition DOM completion; includes browser automation, request, rendering and result scroll; preparation navigation is unmeasured.',
      summary,
      mix,
      warmup,
      measurements: measured.sort((a, b) => a.user - b.user || a.round - b.round),
    };
    const reportPath = testInfo.outputPath('search-performance.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    if (process.env.RECORD_PERFORMANCE_EVIDENCE === '1')
      await writeFile(
        new URL(
          '../../specs/001-warehouse-management/evidence/search-performance.json',
          import.meta.url,
        ),
        JSON.stringify(report, null, 2) + '\n',
      );
    await testInfo.attach('search-performance', {
      path: reportPath,
      contentType: 'application/json',
    });
    console.log(JSON.stringify({ summary, mix }));
    expect(
      warmup.every((sample) => sample.complete),
      'All warmup DOM conditions must pass',
    ).toBe(true);
    expect(measured).toHaveLength(450);
    expect(Object.values(mix).every((cell) => cell.count === 75)).toBe(true);
    expect(summary.completeCount).toBe(450);
    expect(summary.passCount).toBeGreaterThanOrEqual(summary.requiredPassCount);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.close();
  }
});

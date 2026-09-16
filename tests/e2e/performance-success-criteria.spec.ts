import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createPerformanceFixture, PERFORMANCE_SEED } from './support/performance-fixture.js';
import {
  documentKinds,
  documentPerformanceSeed,
  prepareDocumentSources,
  type PerformanceSource,
} from './support/document-performance-fixture.js';

async function generateAndDownload(page: Page, source: PerformanceSource, csrf: string) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const result = await page.evaluate(
    async ({ source, csrf }) => {
      const response = await fetch('/api/v1/documents', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(source),
        signal: AbortSignal.timeout(30_000),
      });
      return { status: response.status, body: await response.json() };
    },
    { source, csrf },
  );
  expect(result.status).toBe(202);
  expect(result.body.data).toMatchObject({ ...source, state: 'READY' });
  const documentId = result.body.data.id as string;
  await page.goto(`/documents?documentId=${documentId}`);
  const downloadButton = page.getByRole('button', { name: 'Download PDF', exact: true });
  await expect(downloadButton).toBeVisible();
  await expect(downloadButton).toBeEnabled();
  const availableMs = performance.now() - start;
  const downloadPromise = page.waitForEvent('download');
  const contentPromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/v1/documents/${documentId}/content`,
  );
  await downloadButton.click();
  const [download, content] = await Promise.all([downloadPromise, contentPromise]);
  expect(content.status()).toBe(200);
  expect(content.headers()['content-type']).toContain('application/pdf');
  const downloadedPath = await download.path(); // waits until all bytes are available
  const elapsedMs = performance.now() - start;
  expect(await download.failure()).toBeNull();
  expect(downloadedPath).not.toBeNull();
  const bytes = await readFile(downloadedPath!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.subarray(-32).toString()).toContain('%%EOF');
  const hash = createHash('sha256').update(bytes).digest('hex');
  expect(hash).toBe(result.body.data.contentHash);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  return { startedAt, elapsedMs, availableMs, documentId, bytes: bytes.length, sha256: hash };
}

test('SC-007: 25 users download 400 uncached PDFs from distinct committed sources', async ({
  browser,
}, testInfo) => {
  const fixture = await createPerformanceFixture({
    salesIntervalSeconds: 108,
    allowLocalPostgres: true,
  });
  const contexts: BrowserContext[] = [];
  const browserErrors: string[] = [];
  try {
    const sources = await prepareDocumentSources(fixture.database);
    const sessions: { page: Page; csrf: string }[] = [];
    for (let user = 0; user < 25; user++) {
      const context = await browser.newContext({
        baseURL: fixture.origin,
        viewport: { width: 1440, height: 1000 },
        extraHTTPHeaders: { 'X-Performance-Client': String(user + 1) },
      });
      contexts.push(context);
      await context.addInitScript(() => localStorage.setItem('warehouse-manager-language', 'en'));
      const login = await context.request.post('/api/v1/auth/login', {
        headers: { Origin: fixture.origin },
        data: { username: `perf-${user + 1}`, password: 'development-password-change-me' },
      });
      expect(login.status()).toBe(200);
      const csrf = login.headers()['x-csrf-token'];
      expect(csrf).toBeTruthy();
      const page = await context.newPage();
      page.on('pageerror', (error) => browserErrors.push(error.message));
      await page.goto('/documents');
      await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible();
      sessions.push({ page, csrf: csrf! });
    }
    // Warm each session with all four renderers, using sources never measured later.
    await Promise.all(
      sessions.map(async ({ page, csrf }, user) => {
        for (let step = 0; step < 4; step++) {
          const kind = documentKinds[(user + step) % 4]!;
          await generateAndDownload(page, sources[kind][user]!, csrf);
        }
      }),
    );
    expect(
      await fixture.database.selectFrom('document_output').select('id').execute(),
    ).toHaveLength(100);
    const measuredAt = new Date().toISOString();
    // Closed loop: each of 25 users immediately begins its next request after
    // validating the preceding download, without a global round barrier or retries.
    const samples = (
      await Promise.all(
        sessions.map(async ({ page, csrf }, user) => {
          const samples = [];
          for (let step = 0; step < 16; step++) {
            const kind = documentKinds[(user + step) % 4]!;
            const source = sources[kind][25 + user * 4 + Math.floor(step / 4)]!;
            samples.push({
              user,
              step,
              ...source,
              ...(await generateAndDownload(page, source, csrf)),
            });
          }
          process.stdout.write(`User ${user + 1}/25 completed 16 measured PDFs\n`);
          return samples;
        }),
      )
    ).flat();
    const documents = await fixture.database
      .selectFrom('document_output')
      .select(['id', 'state', 'source_id'])
      .execute();
    const attempts = await fixture.database
      .selectFrom('output_attempt')
      .select(['document_output_id', 'state', 'mode'])
      .execute();
    const generation = attempts.filter((attempt) => attempt.mode === 'GENERATE');
    const sorted = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.ceil(sorted.length * p) - 1]!;
    const passed = samples.filter((sample) => sample.elapsedMs <= 10_000).length;
    const mix = Object.fromEntries(
      documentKinds.map((kind) => [
        kind,
        samples.filter((sample) => sample.documentType === kind).length,
      ]),
    );
    const report = {
      seed: documentPerformanceSeed,
      baseSeed: PERFORMANCE_SEED,
      measuredAt,
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      sourceHashes: Object.fromEntries(
        await Promise.all(
          [
            'tests/e2e/performance-success-criteria.spec.ts',
            'tests/e2e/support/document-performance-fixture.ts',
            'tests/e2e/support/performance-fixture.ts',
            'apps/api/tests/support/performance-fixture.ts',
            'tests/e2e/support/performance-seed.sql',
            'apps/api/src/modules/documents/document-service.ts',
            'apps/api/src/modules/documents/pdf-renderers.ts',
            'apps/web/dist/index.html',
          ].map(async (path) => [
            path,
            createHash('sha256')
              .update(await readFile(path))
              .digest('hex'),
          ]),
        ),
      ),
      counts: fixture.metadata.counts,
      users: 25,
      role: 'ADMINISTRATOR',
      warmupActions: 100,
      measuredActions: samples.length,
      profile:
        '25 independent closed-loop browser sessions, 16 sequential measured actions each; no round barrier, mocks or retries',
      timing:
        'Before browser POST /documents through production document page navigation, visible enabled Download PDF action, and complete PDF download; authentication, source preparation and warmup excluded. Includes navigation and automation overhead.',
      sourceProfile: {
        salesIntervalSeconds: 108,
        tickets: '1 line',
        routeLoads: '10 lines',
        cashCloses: '125 distinct nonempty daily periods, four reporting groups',
        reports: '125 distinct FINANCIAL_SUMMARY snapshots, same nonempty daily periods',
      },
      mix,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: sorted.at(-1),
      passed,
      passRate: passed / samples.length,
      uncached: {
        documents: documents.length,
        distinctSources: new Set(documents.map((doc) => doc.source_id)).size,
        generationAttempts: generation.length,
        successfulGenerations: generation.filter((attempt) => attempt.state === 'SUCCEEDED').length,
      },
      environment: {
        os: `${platform()} ${release()}`,
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
        memoryBytes: totalmem(),
        node: process.version,
        browser: browser.version(),
        postgres: fixture.metadata.postgres,
        frontend: 'Vite production build',
        network: 'loopback; rate limits enabled; 25 distinct trusted-proxy IPs',
        packageManager: JSON.parse(await readFile('package.json', 'utf8')).packageManager,
      },
      browserErrors,
      samples,
    };
    await writeFile(
      testInfo.outputPath('document-performance.json'),
      JSON.stringify(report, null, 2),
    );
    await testInfo.attach('document-performance', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    for (let user = 0; user < 4; user++)
      await sessions[user]!.page.screenshot({
        path: testInfo.outputPath(`document-${user}.png`),
        fullPage: true,
      });
    expect(samples).toHaveLength(400);
    expect(Object.values(mix)).toEqual([100, 100, 100, 100]);
    expect(new Set(samples.map((sample) => sample.sourceId)).size).toBe(400);
    expect(report.uncached).toEqual({
      documents: 500,
      distinctSources: 500,
      generationAttempts: 500,
      successfulGenerations: 500,
    });
    expect(documents.every((doc) => doc.state === 'READY')).toBe(true);
    expect(browserErrors).toEqual([]);
    expect(passed, 'SC-007 requires at least 95% within 10 seconds').toBeGreaterThanOrEqual(380);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.close();
  }
});

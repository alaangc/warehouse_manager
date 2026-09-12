import { test, expect, login, api } from './support/document-fixtures.js';

test.use({ actionTimeout: 5_000 });

test('Administrator downloads all four PDFs; Driver reuses own Ticket and assigned confirmed load', async ({
  page,
  warehouse: h,
}) => {
  test.setTimeout(120_000);
  await login(page, 'admin');
  for (const source of h.sources) {
    await page.goto(`/documents?${new URLSearchParams(source)}`);
    await page.getByRole('button', { name: /generate pdf/i }).click();
    const button = page.getByRole('button', { name: /download/i });
    await expect(button).toBeEnabled();
    const pending = page.waitForEvent('download');
    await button.click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await download.failure()).toBeNull();
  }
  for (const source of h.sources.slice(0, 2)) {
    const original = await h.create(source);
    await login(page, h.own.username);
    const reused = await api(page, '/documents', source);
    expect(reused.status).toBe(202);
    expect(reused.body.data.id).toBe(original.id);
    expect(reused.body.data.createdBy).toBe(h.admin.id);
    const content = await api(page, `/documents/${original.id}/content`);
    expect(content.status).toBe(200);
    expect(content.contentType).toContain('application/pdf');
    expect(content.text.startsWith('%PDF-')).toBe(true);
  }
});

test('Chromium prints three supported types, rejects REPORT, and requires explicit UNKNOWN reprint', async ({
  page,
  warehouse: h,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Approved Web Bluetooth path is Chromium-only; PDFs run in every browser.',
  );
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const state = { writes: 0, failNext: false };
    Object.assign(window, { documentPrintTest: state });
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: async () => ({
          name: 'Document E2E printer',
          addEventListener() {},
          removeEventListener() {},
          gatt: {
            connected: true,
            disconnect() {},
            connect: async () => ({
              getPrimaryService: async () => ({
                getCharacteristic: async () => ({
                  writeValueWithResponse: async () => {
                    state.writes++;
                    if (state.failNext) {
                      state.failNext = false;
                      throw new DOMException('Ambiguous delivery', 'NetworkError');
                    }
                  },
                }),
              }),
            }),
          },
        }),
      },
    });
  });
  await login(page, 'admin');
  await page.goto('/settings');
  await page.getByLabel('Printer', { exact: true }).selectOption(h.printerId);
  await page.getByRole('button', { name: 'Save printer selection' }).click();
  for (const source of h.sources.slice(0, 3)) {
    const doc = await h.create(source);
    await page.goto(`/documents?documentId=${doc.id}`);
    await page.getByRole('button', { name: /^print$/i }).click();
    await page.getByRole('button', { name: /connect printer/i }).click();
    const terminal = page.waitForResponse(
      (r) =>
        r.url().includes('/output-attempts') && r.request().postDataJSON()?.state === 'SUCCEEDED',
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^print$/i })
      .click();
    expect((await terminal).status()).toBe(201);
    expect(
      await page.evaluate(() => Reflect.get(window, 'documentPrintTest').writes),
    ).toBeGreaterThan(0);
  }
  const report = await h.create(h.sources[3]!);
  await page.goto(`/documents?documentId=${report.id}`);
  const before = await page.evaluate(() => Reflect.get(window, 'documentPrintTest').writes);
  for (const mode of ['PRINT', 'REPRINT']) {
    expect(
      (
        await api(page, '/output-attempts', {
          documentId: report.id,
          mode,
          printerProfileId: h.printerId,
          state: 'STARTED',
        })
      ).status,
    ).toBe(422);
  }
  await expect(page.getByRole('button', { name: /^print$|reprint/i })).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'documentPrintTest').writes)).toBe(before);
  const doc = await h.create(h.ticket);
  await page.goto(`/documents?documentId=${doc.id}`);
  await page.getByRole('button', { name: /^print$/i }).click();
  await page.getByRole('button', { name: /connect printer/i }).click();
  await page.evaluate(() => {
    Reflect.get(window, 'documentPrintTest').failNext = true;
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^print$/i })
    .click();
  await expect(page.getByText(/unknown|may have printed/i)).toBeVisible();
  const count = await page.evaluate(() => Reflect.get(window, 'documentPrintTest').writes);
  await page.getByRole('button', { name: /reprint/i }).click();
  expect(await page.evaluate(() => Reflect.get(window, 'documentPrintTest').writes)).toBe(count);
  await page.getByRole('button', { name: /confirm reprint/i }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'documentPrintTest').writes))
    .toBeGreaterThan(count);
  expect(
    await h.database.selectFrom('sale').select('id').where('id', '=', h.ticket.sourceId).execute(),
  ).toHaveLength(1);
});

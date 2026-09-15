import { test, expect } from '@playwright/test';

const id = '00000000-0000-4000-8000-000000000130';
const sourceId = '00000000-0000-4000-8000-000000000131';
const document = {
  id,
  sourceId,
  documentType: 'TICKET',
  sourceType: 'SALE',
  state: 'READY',
  contentVersion: '1',
  createdBy: sourceId,
  createdAt: '2026-09-13T12:00:00Z',
};

for (const width of [1440, 390]) {
  test(`document history and PDF download at ${width}px with HTTP fixtures`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('warehouse-manager-language', 'en'));
    if (width === 390)
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'canShare', {
          configurable: true,
          value: (data: ShareData) => data.files?.[0]?.type === 'application/pdf',
        });
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: (data: ShareData) => {
            Reflect.set(window, 'documentShare', {
              active: navigator.userActivation.isActive,
              name: data.files?.[0]?.name,
              size: data.files?.[0]?.size,
            });
            return Promise.resolve();
          },
        });
      });
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      let body: unknown;
      if (url.pathname.endsWith('/auth/session'))
        body = {
          data: {
            id: sourceId,
            username: 'administrator',
            displayName: 'Administrator',
            active: true,
            role: 'ADMINISTRATOR',
          },
        };
      else if (url.pathname.endsWith('/content')) {
        await route.fulfill({
          contentType: 'application/pdf',
          headers: { 'Content-Disposition': 'attachment; filename="ticket-130.pdf"' },
          body: '%PDF-1.4\n%%EOF',
        });
        return;
      } else if (url.pathname === '/api/v1/documents')
        body = {
          data: [document],
          page: {
            hasNextPage: !url.searchParams.has('cursor'),
            nextCursor: url.searchParams.has('cursor') ? null : 'opaque-cursor',
          },
        };
      else if (url.pathname.endsWith(`/documents/${id}`)) body = { data: document };
      else if (url.pathname.endsWith(`/output-attempts/${id}`))
        body = {
          data: {
            id,
            actorId: sourceId,
            documentId: id,
            mode: 'DOWNLOAD',
            state: 'SUCCEEDED',
            attemptNumber: 1,
            createdAt: document.createdAt,
          },
        };
      else if (url.pathname.endsWith('/output-attempts'))
        body = {
          data: [
            {
              id,
              actorId: sourceId,
              documentId: id,
              mode: 'DOWNLOAD',
              state: 'SUCCEEDED',
              attemptNumber: 1,
              createdAt: document.createdAt,
            },
          ],
          page: { hasNextPage: false, nextCursor: null },
        };
      else {
        await route.fulfill({ status: 404, json: { status: 404, title: 'Not found' } });
        return;
      }
      await route.fulfill({ json: body });
    });
    await page.goto('/documents');
    await expect(page.getByRole('button', { name: 'View document' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`t130-history-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await page.getByRole('button', { name: 'View document' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
    await page.screenshot({
      path: test.info().outputPath(`t130-detail-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download PDF' }).click();
    expect((await downloaded).suggestedFilename()).toBe('ticket-130.pdf');
    if (width === 390) {
      expect(await page.evaluate(() => Reflect.get(window, 'documentShare'))).toBeUndefined();
      await dialog.getByRole('button', { name: 'Share PDF' }).click();
      expect(await page.evaluate(() => Reflect.get(window, 'documentShare'))).toEqual({
        active: true,
        name: 'ticket-130.pdf',
        size: 14,
      });
      await expect(dialog.getByRole('status')).toContainText('PDF handed to the share target.');
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('tab', { name: 'Output attempts' }).click();
    await page.getByRole('button', { name: 'View attempt' }).click();
    await expect(page.getByRole('dialog')).toContainText(sourceId);
  });
}

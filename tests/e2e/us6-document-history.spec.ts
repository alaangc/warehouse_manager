import { test, expect, login, api } from './support/document-fixtures.js';

test('history traverses pages, filters and opens Administrator-created own-source attempts', async ({
  page,
  warehouse: h,
}) => {
  test.setTimeout(120_000);
  const ids: string[] = [];
  for (let index = 0; index < 27; index++) {
    const doc = await h.create(await h.own.sale());
    ids.push(doc.id);
    expect(
      (
        await h.post(h.admin, '/output-attempts', {
          documentId: doc.id,
          mode: 'DOWNLOAD',
          state: 'SUCCEEDED',
        })
      ).status,
    ).toBe(201);
  }
  await login(page, h.own.username);
  await page.goto('/documents');
  await page.getByRole('button', { name: /^next/i }).click();
  await expect(page.getByRole('button', { name: /^next/i })).toBeDisabled();
  for (const endpoint of ['documents', 'output-attempts']) {
    const first = await api(page, `/${endpoint}`);
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(25);
    const cursor = first.body.page.nextCursor;
    const next = await api(page, `/${endpoint}?cursor=${encodeURIComponent(cursor)}`);
    expect(next.status).toBe(200);
    const rows = [...first.body.data, ...next.body.data];
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    if (endpoint === 'documents')
      expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(ids));
    else {
      const detail = await api(page, `/output-attempts/${rows[0].id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.actorId).toBe(h.admin.id);
    }
    expect(
      (
        await api(
          page,
          `/${endpoint}?cursor=${encodeURIComponent(cursor)}&from=2000-01-01T00:00:00Z`,
        )
      ).status,
    ).toBe(403);
    await login(page, h.other.username);
    expect((await api(page, `/${endpoint}?cursor=${encodeURIComponent(cursor)}`)).status).toBe(403);
    await login(page, h.own.username);
  }
  await page.goto('/documents?collection=attempts');
  await page
    .getByRole('button', { name: /view attempt/i })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText(h.admin.id);
});

test('Driver cannot use forbidden sources, content URLs, attempts, filters or TEST_PRINT history', async ({
  page,
  warehouse: h,
}) => {
  test.setTimeout(120_000);
  await login(page, h.own.username);
  for (const source of [h.foreignTicket, h.other.load, ...h.sources.slice(2)]) {
    const doc = await h.create(source);
    const attempt = await h.post(h.admin, '/output-attempts', {
      documentId: doc.id,
      mode: 'DOWNLOAD',
      state: 'SUCCEEDED',
    });
    expect(attempt.status).toBe(201);
    const before = await h.database
      .selectFrom('output_attempt')
      .selectAll()
      .orderBy('id')
      .execute();
    expect((await api(page, '/documents', source)).status).toBe(403);
    for (const path of [
      `/documents/${doc.id}`,
      `/documents/${doc.id}/content`,
      `/documents?sourceType=${source.sourceType}&sourceId=${source.sourceId}`,
      `/output-attempts?documentId=${doc.id}`,
      `/output-attempts/${attempt.body.data.id}`,
    ]) {
      const response = await api(page, path);
      expect(response.status).toBe(403);
      expect(response.body).not.toHaveProperty('data');
      expect(response.contentType).not.toContain('application/pdf');
    }
    for (const mode of ['GENERATE', 'DOWNLOAD', 'SHARE', 'PRINT', 'REPRINT'])
      expect(
        (
          await api(page, '/output-attempts', {
            documentId: doc.id,
            mode,
            state: 'STARTED',
            ...(['PRINT', 'REPRINT'].includes(mode) ? { printerProfileId: h.printerId } : {}),
          })
        ).status,
      ).toBe(403);
    expect(
      await h.database.selectFrom('output_attempt').selectAll().orderBy('id').execute(),
    ).toEqual(before);
    await page.goto(`/documents?documentId=${doc.id}`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: /download|share|print/i })).toHaveCount(0);
  }
  const testPrint = await api(page, '/output-attempts', {
    mode: 'TEST_PRINT',
    printerProfileId: h.printerId,
    state: 'SUCCEEDED',
  });
  expect(testPrint.status).toBe(201);
  expect((await api(page, `/output-attempts/${testPrint.body.data.id}`)).status).toBe(403);
  expect((await api(page, '/output-attempts?mode=TEST_PRINT')).status).toBe(403);
  expect((await api(page, '/documents', h.draft.load)).status).toBe(403);
  await login(page, h.draft.username);
  const draft = await api(page, '/documents', h.draft.load);
  expect(draft.status).toBe(409);
  expect(draft.body.code).toBe('ROUTE_LOAD_NOT_CONFIRMED');
  await login(page, 'admin');
  expect((await api(page, `/output-attempts/${testPrint.body.data.id}`)).status).toBe(200);
  await page.goto('/documents?collection=attempts&mode=TEST_PRINT');
  await expect(page.getByRole('table')).toContainText('TEST_PRINT');
});

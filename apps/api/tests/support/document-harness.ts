import { expect } from 'vitest';
import type { Response } from 'supertest';
import { z } from 'zod';
import {
  administrationHarness,
  testPrinterProfile,
  type TestPrincipal,
} from './administration-harness.js';
import { createSaleScenario, saleCommand } from './sales-factories.js';

export const documentTypes = ['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT'] as const;
export type Source = { documentType: string; sourceType: string; sourceId: string };
// Independent response assertions mirror the checked-in OpenAPI, not implementation schemas.
export const documentResource = z
  .object({
    id: z.uuid(),
    documentType: z.enum(documentTypes),
    sourceType: z.string(),
    sourceId: z.uuid(),
    contentVersion: z.string(),
    state: z.enum(['PENDING', 'READY', 'FAILED']),
    contentHash: z.string().nullable().optional(),
    createdBy: z.uuid(),
    createdAt: z.iso.datetime(),
    readyAt: z.iso.datetime().nullable().optional(),
    lastErrorCode: z.string().nullable().optional(),
  })
  .strict();
export const attemptResource = z
  .object({
    id: z.uuid(),
    actorId: z.uuid(),
    documentId: z.uuid().nullable().optional(),
    mode: z.enum(['GENERATE', 'DOWNLOAD', 'SHARE', 'PRINT', 'REPRINT', 'TEST_PRINT']),
    state: z.enum(['STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN']),
    attemptNumber: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    printerProfileId: z.uuid().nullable().optional(),
    errorCode: z.string().nullable().optional(),
    requestId: z.string().nullable().optional(),
  })
  .strict();
export function page(response: Response, kind: 'documents' | 'attempts') {
  expect(response.status).toBe(200);
  return z
    .object({
      data: z.array(kind === 'documents' ? documentResource : attemptResource),
      page: z.object({ hasNextPage: z.boolean(), nextCursor: z.string().nullable() }).strict(),
    })
    .strict()
    .parse(response.body);
}
export function problem(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body).toMatchObject({
    status,
    title: expect.any(String),
    type: expect.any(String),
  });
  for (const key of ['data', 'sourceId', 'documentId', 'contentHash', 'storageKey', 'stack'])
    expect(response.body).not.toHaveProperty(key);
}

export async function documentHarness() {
  const h = await administrationHarness();
  try {
    const admin = await h.login('admin');
    const command = (actor: TestPrincipal, path: string, body: object) =>
      h.send(actor, 'post', path, body).set('Idempotency-Key', crypto.randomUUID());
    const profile = await command(admin, '/printer-profiles', testPrinterProfile);
    expect(profile.status).toBe(201);
    const printerProfileId = profile.body.data.id as string;
    async function scenario() {
      const s = await createSaleScenario(h.database, { stockQuantity: '1000.000' });
      const user = await h.database
        .selectFrom('app_user')
        .select('username')
        .where('id', '=', s.driver.id)
        .executeTakeFirstOrThrow();
      const actor = await h.login(user.username);
      // Set the uncommitted fixture route to its initial state before real load/sale commands.
      await h.database
        .updateTable('route')
        .set({ state: 'PREPARING', started_at: null })
        .where('id', '=', s.route.id)
        .execute();
      async function sale(): Promise<Source> {
        const response = await command(
          actor,
          '/sales',
          saleCommand({ customerId: s.customer.id, routeId: s.route.id, productId: s.product.id }),
        );
        expect(response.status).toBe(201);
        return { documentType: 'TICKET', sourceType: 'SALE', sourceId: response.body.data.id };
      }
      async function load(confirmed: boolean): Promise<Source> {
        const draft = await h.send(actor, 'put', `/routes/${s.route.id}/load`, {
          expectedVersion: 1,
          lines: [{ productId: s.product.id, quantity: '1.000' }],
        });
        expect(draft.status).toBe(200);
        if (confirmed) {
          await h.database
            .insertInto('inventory_balance')
            .values({
              stock_location_id: s.origin.stockLocationId,
              product_id: s.product.id,
              quantity: '100.000',
            })
            .onConflict((oc) =>
              oc.columns(['stock_location_id', 'product_id']).doUpdateSet({ quantity: '100.000' }),
            )
            .execute();
          const result = await command(actor, `/routes/${s.route.id}/load/confirmation`, {
            expectedVersion: draft.body.data.version,
          });
          expect(result.status).toBe(200);
          expect(
            (await command(actor, `/routes/${s.route.id}/start`, { expectedVersion: 1 })).status,
          ).toBe(200);
        }
        return {
          documentType: 'ROUTE_LOAD',
          sourceType: 'ROUTE_LOAD',
          sourceId: draft.body.data.id,
        };
      }
      return { actor, sale, load };
    }
    const own = await scenario(),
      other = await scenario(),
      draftScenario = await scenario();
    const load = await own.load(true),
      foreignLoad = await other.load(true),
      draft = await draftScenario.load(false);
    const ticket = await own.sale(),
      foreignTicket = await other.sale();
    const period = { periodKind: 'DAY', anchorDate: '2026-09-11' };
    const cash = await command(admin, '/cash-closes', period);
    expect(cash.status).toBe(201);
    const report = await command(admin, '/report-snapshots', {
      reportType: 'FINANCIAL_SUMMARY',
      filters: period,
    });
    expect(report.status).toBe(201);
    const cashClose: Source = {
      documentType: 'CASH_CLOSE',
      sourceType: 'CASH_CLOSE',
      sourceId: cash.body.data.id,
    };
    const reportSource: Source = {
      documentType: 'REPORT',
      sourceType: 'REPORT_SNAPSHOT',
      sourceId: report.body.data.id,
    };
    const sources = [ticket, load, cashClose, reportSource];
    async function create(source: Source, actor = admin) {
      const response = await command(actor, '/documents', source);
      expect(response.status).toBe(202);
      const doc = documentResource.parse(response.body.data);
      expect(doc).toMatchObject(source);
      return doc;
    }
    async function ready(source: Source, actor = admin) {
      const doc = await create(source, actor);
      await expect
        .poll(
          async () => {
            const response = await h.send(actor, 'get', `/documents/${doc.id}`);
            expect(response.status).toBe(200);
            return documentResource.parse(response.body.data).state;
          },
          { timeout: 10_000 },
        )
        .toBe('READY');
      return doc;
    }
    async function attempt(documentId: string, mode = 'DOWNLOAD', actor = admin) {
      const response = await command(actor, '/output-attempts', {
        documentId,
        mode,
        state: 'SUCCEEDED',
        ...(['PRINT', 'REPRINT'].includes(mode) ? { printerProfileId } : {}),
      });
      expect(response.status).toBe(201);
      return attemptResource.parse(response.body.data);
    }
    return {
      ...h,
      admin,
      driver: own.actor,
      draftDriver: draftScenario.actor,
      other: other.actor,
      command,
      create,
      ready,
      attempt,
      printerProfileId,
      sources,
      ticket,
      load,
      draft,
      foreignTicket,
      foreignLoad,
      cashClose,
      reportSource,
      newSale: own.sale,
    };
  } catch (error) {
    await h.close();
    throw error;
  }
}

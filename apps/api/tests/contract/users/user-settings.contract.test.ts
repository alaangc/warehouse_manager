import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createEnRouteFixture, createSaleScenario } from '../../support/sales-factories.js';
import {
  UserResourceSchema,
  BusinessSettingResourceSchema,
  PrinterProfileResourceSchema,
} from '@warehouse/contracts';
import {
  administrationHarness,
  testPrinterProfile,
  type TestPrincipal,
} from '../../support/administration-harness.js';

const administratorOperations = [
  ['get', '/users'],
  ['post', '/users'],
  ['get', '/users/00000000-0000-4000-8000-000000000001'],
  ['patch', '/users/00000000-0000-4000-8000-000000000001'],
  ['get', '/settings/business'],
  ['patch', '/settings/business'],
  ['post', '/printer-profiles'],
  ['patch', '/printer-profiles/00000000-0000-4000-8000-000000000001'],
] as const;
const sharedOperations = [
  ['get', '/printer-profiles'],
  ['get', '/me/printer-preference'],
  ['put', '/me/printer-preference'],
  ['post', '/output-attempts'],
  ['get', '/overview'],
] as const;

function expectProblem(response: request.Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body).toMatchObject({
    status,
    title: expect.any(String),
    type: expect.any(String),
  });
  expect(response.body).not.toHaveProperty('stack');
  expect(response.body).not.toHaveProperty('password');
  expect(response.body).not.toHaveProperty('password_hash');
}

describe('user and settings HTTP contract', () => {
  let harness: Awaited<ReturnType<typeof administrationHarness>>;
  let admin: TestPrincipal;
  let driver: TestPrincipal;
  beforeAll(async () => {
    harness = await administrationHarness();
    admin = await harness.login('admin');
    driver = await harness.login('driver');
  }, 120_000);
  afterAll(async () => {
    await harness?.close();
  });

  it('documents all administration and document-free printer test operations', async () => {
    const contract = await readFile(
      fileURLToPath(new URL('../../../../../packages/contracts/openapi.yaml', import.meta.url)),
      'utf8',
    );
    for (const operation of [
      'listUsers',
      'createUser',
      'getUser',
      'updateUser',
      'getBusinessSettings',
      'updateBusinessSettings',
      'listPrinterProfiles',
      'createPrinterProfile',
      'updatePrinterProfile',
      'getMyPrinterPreference',
      'setMyPrinterPreference',
      'recordOutputAttempt',
      'getRoleOverview',
    ])
      expect(contract).toContain(`operationId: ${operation}`);
    expect(contract).toContain('required: [mode, printerProfileId, state]');
  });

  it('creates, lists, reads and updates users with safe fields and optimistic conflicts', async () => {
    const input = {
      username: `test-${crypto.randomUUID()}`,
      displayName: 'New Driver',
      role: 'DRIVER',
      password: 'new-driver-password-123',
    };
    const created = await harness.send(admin, 'post', '/users', input);
    expect(created.status).toBe(201);
    const user = created.body.data;
    expect(UserResourceSchema.safeParse(user).success).toBe(true);
    expect(user).toMatchObject({
      username: input.username,
      role: 'DRIVER',
      active: true,
      version: 1,
    });
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('password_hash');
    expect(user).not.toHaveProperty('passwordHash');
    expect((await harness.send(admin, 'get', `/users/${user.id}`)).body.data).toEqual(user);
    const list = await harness.send(admin, 'get', `/users?search=${input.username}&limit=1`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body).toHaveProperty('page');
    expect(list.body.page).toEqual({ hasNextPage: false, nextCursor: null });
    const changed = await harness.send(admin, 'patch', `/users/${user.id}`, {
      expectedVersion: 1,
      displayName: 'Renamed Driver',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.data.version).toBe(2);
    expect(
      (
        await harness.send(admin, 'patch', `/users/${user.id}`, {
          expectedVersion: 1,
          displayName: 'Stale',
        })
      ).status,
    ).toBe(409);
    expect((await harness.send(admin, 'post', '/users', input)).status).toBe(409);
    expect(
      (await harness.send(admin, 'post', '/users', { ...input, password: 'short' })).status,
    ).toBe(422);
  });

  it.each(administratorOperations)(
    'denies Driver %s %s before payload validation',
    async (method, path) => {
      expectProblem(
        await harness.send(driver, method, path, method === 'get' ? undefined : {}),
        403,
      );
    },
  );

  it.each([...administratorOperations, ...sharedOperations])(
    'denies anonymous %s %s',
    async (method, path) => {
      expectProblem(await harness.send(null, method, path, method === 'get' ? undefined : {}), 401);
    },
  );

  it.each([
    ...administratorOperations.filter(([method]) => method !== 'get'),
    ...sharedOperations.filter(([method]) => method !== 'get'),
  ])('requires CSRF for authenticated %s %s', async (method, path) => {
    const endpoint = request(harness.app)[method](`/api/v1${path}`);
    const response = await endpoint
      .set('Origin', 'https://warehouse.test')
      .set('Cookie', admin.cookie)
      .send({});
    expectProblem(response, 403);
    expect(response.body.code).toBe('CSRF_INVALID');
  });

  it('updates business settings with fixed financial rules and optimistic conflicts', async () => {
    const settings = await harness.send(admin, 'get', '/settings/business');
    expect(settings.status).toBe(200);
    const body = {
      expectedVersion: settings.body.data.version,
      currencyCode: 'MXN',
      businessTimezone: 'America/Hermosillo',
      reason: 'Confirmed operating timezone',
    };
    const changed = await harness.send(admin, 'patch', '/settings/business', body);
    expect(changed.status).toBe(200);
    expect(BusinessSettingResourceSchema.safeParse(changed.body.data).success).toBe(true);
    expect(changed.body.data).toMatchObject({
      currencyCode: 'MXN',
      currencyScale: 2,
      businessTimezone: 'America/Hermosillo',
      partnerShareRate: '0.500000',
      moneyRoundingMode: 'HALF_AWAY_FROM_ZERO',
      version: body.expectedVersion + 1,
    });
    expectProblem(await harness.send(admin, 'patch', '/settings/business', body), 409);
    body.expectedVersion = changed.body.data.version;
    expect(
      (
        await harness.send(admin, 'patch', '/settings/business', {
          ...body,
          partnerShareRate: '0.6',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await harness.send(admin, 'patch', '/settings/business', {
          ...body,
          businessTimezone: 'Mars/Olympus',
        })
      ).status,
    ).toBe(422);
  });

  it.each(['Administrator', 'Driver'] as const)(
    'allows %s preference and document-free tests only for approved printers',
    async (role) => {
      const principal = role === 'Administrator' ? admin : driver;
      const created = await harness.send(admin, 'post', '/printer-profiles', {
        ...testPrinterProfile,
        name: `Approved ${role} printer`,
      });
      expect(created.status).toBe(201);
      const profile = created.body.data;
      expect(PrinterProfileResourceSchema.safeParse(profile).success).toBe(true);
      const available = await harness.send(principal, 'get', '/printer-profiles');
      expect(available.status).toBe(200);
      expect(available.body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: profile.id })]),
      );
      const preference = await harness.send(principal, 'put', '/me/printer-preference', {
        printerProfileId: profile.id,
        deviceLabel: 'Van printer',
      });
      expect(preference.status).toBe(200);
      expect(preference.body.data).toMatchObject({
        printerProfileId: profile.id,
        deviceLabel: 'Van printer',
      });
      expect(
        (await harness.send(principal, 'get', '/me/printer-preference')).body.data,
      ).toMatchObject(preference.body.data);
      expect(
        (
          await harness.send(principal, 'put', '/me/printer-preference', {
            printerProfileId: profile.id,
            userId: role === 'Administrator' ? driver.id : admin.id,
          })
        ).status,
      ).toBe(422);
      const valid = { mode: 'TEST_PRINT', printerProfileId: profile.id, state: 'SUCCEEDED' };
      for (const state of ['STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN']) {
        const attempt = await harness.send(principal, 'post', '/output-attempts', {
          ...valid,
          state,
        });
        expect(attempt.status).toBe(201);
        expect(attempt.body.data).toMatchObject({
          actorId: principal.id,
          mode: 'TEST_PRINT',
          documentId: null,
          printerProfileId: profile.id,
          state,
          attemptNumber: expect.any(Number),
        });
      }
      for (const invalid of [
        { mode: 'TEST_PRINT', state: 'SUCCEEDED' },
        { ...valid, documentId: crypto.randomUUID() },
        { ...valid, actorId: role === 'Administrator' ? driver.id : admin.id },
        { ...valid, state: 'PRINTED' },
      ])
        expectProblem(await harness.send(principal, 'post', '/output-attempts', invalid), 422);
      expect(
        (
          await harness.send(admin, 'patch', `/printer-profiles/${profile.id}`, {
            ...testPrinterProfile,
            name: `Approved ${role} printer`,
            expectedVersion: profile.version,
            active: false,
            reason: 'Retired printer',
          })
        ).status,
      ).toBe(200);
      expectProblem(await harness.send(principal, 'post', '/output-attempts', valid), 409);
      const retired = await harness.send(driver, 'get', '/printer-profiles');
      expect(retired.body.data).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: profile.id })]),
      );
      expect((await harness.send(admin, 'get', '/printer-profiles')).body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: profile.id, active: false })]),
      );
    },
  );

  it('validates identifiers and query shapes before database access and binds pagination to filters', async () => {
    for (const path of [
      '/users/not-a-uuid',
      '/users?active=invalid',
      '/users?limit=0',
      '/users?limit=101',
      '/users?limit=1.5',
      '/users?limit=1&limit=2',
      '/users?role=DRIVER',
      '/users?cursor=invalid',
    ]) {
      expectProblem(await harness.send(admin, 'get', path), 422);
    }
    expectProblem(await harness.send(driver, 'get', '/users/not-a-uuid'), 403);
    const first = await harness.send(admin, 'get', '/users?limit=1');
    expect(first.body.page.hasNextPage).toBe(true);
    const cursor = encodeURIComponent(first.body.page.nextCursor);
    const second = await harness.send(admin, 'get', `/users?limit=1&cursor=${cursor}`);
    expect(second.status).toBe(200);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    expectProblem(await harness.send(admin, 'get', `/users?active=false&cursor=${cursor}`), 422);
    expectProblem(
      await harness.send(driver, 'get', `/me/printer-preference?userId=${admin.id}`),
      422,
    );
    expectProblem(await harness.send(driver, 'get', '/printer-profiles?includeArchived=true'), 422);
    expectProblem(await harness.send(driver, 'get', `/overview?driverId=${admin.id}`), 422);
  });

  it('returns role-scoped overviews and rejects anonymous access', async () => {
    const foreign = await createSaleScenario(harness.database);
    const assigned = await createEnRouteFixture(harness.database, {
      originLocationId: foreign.origin.id,
      driverId: driver.id,
      createdBy: admin.id,
    });
    const overview = await harness.send(admin, 'get', '/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.data.actions).toContain('/users');
    const limited = await harness.send(driver, 'get', '/overview');
    expect(limited.status).toBe(200);
    expect(limited.body.data.actions).not.toContain('/users');
    expect(limited.body.data).not.toHaveProperty('grossTotal');
    expect(limited.body.data.routes).toEqual([
      { id: assigned.route.id, driverId: driver.id, state: 'EN_ROUTE' },
    ]);
    expect(overview.body.data.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: assigned.route.id }),
        expect.objectContaining({ id: foreign.route.id }),
      ]),
    );
    expect((await harness.send(null, 'get', '/overview')).status).toBe(401);
  });
});

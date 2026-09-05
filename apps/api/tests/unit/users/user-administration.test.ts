import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import {
  userChangeEffects,
  userAuditSnapshot,
  assertUserRouteChange,
  hashUserPassword,
  passwordNeedsRehash,
  validateBusinessSettingChange,
  composeRoleOverview,
} from '../../../src/modules/users/user-domain.js';

const user = {
  id: 'user-1',
  username: 'driver',
  displayName: 'Driver',
  role: 'DRIVER' as const,
  active: true,
  version: 1,
};
describe('user administration rules', () => {
  it('revokes sessions for role, password, and deactivation changes only', () => {
    expect(userChangeEffects(user, { ...user, role: 'ADMINISTRATOR' }, false)).toEqual({
      revokeSessions: true,
      action: 'USER_UPDATED',
    });
    expect(userChangeEffects(user, user, true).revokeSessions).toBe(true);
    expect(userChangeEffects(user, { ...user, active: false }, false)).toEqual({
      revokeSessions: true,
      action: 'USER_DEACTIVATED',
    });
    expect(userChangeEffects(user, { ...user, displayName: 'Renamed' }, false).revokeSessions).toBe(
      false,
    );
  });

  it('blocks removal of an assigned Driver until the route is closed or reassigned', () => {
    for (const state of ['PREPARING', 'EN_ROUTE', 'RETURNED']) {
      expect(() => assertUserRouteChange(user, { ...user, active: false }, [state])).toThrow(
        expect.objectContaining({ code: 'USER_ACTIVE_ROUTE' }),
      );
      expect(() =>
        assertUserRouteChange(user, { ...user, role: 'ADMINISTRATOR' }, [state]),
      ).toThrow();
    }
    expect(() => assertUserRouteChange(user, { ...user, active: false }, ['CLOSED'])).not.toThrow();
    expect(() => assertUserRouteChange(user, user, ['EN_ROUTE'])).not.toThrow();
  });

  it('allowlists audit fields and never copies credentials or tokens', () => {
    const candidate = {
      ...user,
      password: 'secret',
      password_hash: 'hash',
      session: 'session',
      csrf: 'csrf',
      token: 'token',
    };
    expect(userAuditSnapshot(candidate)).toEqual(user);
  });

  it('hashes rotated passwords freshly with Argon2id and detects old hash parameters', async () => {
    const password = 'a-long-test-password';
    const first = await hashUserPassword(password);
    const second = await hashUserPassword(password);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(first, password)).toBe(true);
    expect(await argon2.verify(first, 'wrong-password')).toBe(false);
    expect(passwordNeedsRehash(first)).toBe(false);
    const old = await argon2.hash(password, { memoryCost: 8192, timeCost: 1, parallelism: 1 });
    expect(passwordNeedsRehash(old)).toBe(true);
    await expect(hashUserPassword('short')).rejects.toThrow();
  });

  it('validates IANA timezone and fixed financial settings', () => {
    const settings = {
      currencyCode: 'MXN',
      currencyScale: 2,
      businessTimezone: 'America/Hermosillo',
      partnerShareRate: '0.500000',
      moneyRoundingMode: 'HALF_AWAY_FROM_ZERO',
    };
    expect(() => validateBusinessSettingChange(settings)).not.toThrow();
    for (const invalid of [
      { currencyCode: 'mxn' },
      { currencyScale: 3 },
      { partnerShareRate: '0.600000' },
      { moneyRoundingMode: 'HALF_EVEN' },
      { businessTimezone: 'Mars/Olympus' },
    ]) {
      expect(() => validateBusinessSettingChange({ ...settings, ...invalid })).toThrow();
    }
  });

  it('composes an overview without exposing other Drivers or administrator financial totals', () => {
    const source = {
      grossTotal: '100.01',
      lowStockCount: 2,
      routes: [
        { id: 'mine', driverId: user.id, state: 'EN_ROUTE' },
        { id: 'other', driverId: 'someone-else', state: 'EN_ROUTE' },
      ],
    };
    const driver = composeRoleOverview(user, source);
    expect(driver).toMatchObject({ routes: [source.routes[0]] });
    expect(driver).not.toHaveProperty('grossTotal');
    expect(driver.actions).not.toContain('/users');
    const admin = composeRoleOverview({ ...user, role: 'ADMINISTRATOR' }, source);
    expect(admin).toMatchObject({ grossTotal: '100.01', lowStockCount: 2, routes: source.routes });
    expect(admin.actions).toContain('/users');
  });
});

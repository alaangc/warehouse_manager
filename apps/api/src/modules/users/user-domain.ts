import argon2 from 'argon2';
import { Temporal } from '@js-temporal/polyfill';

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  role: 'ADMINISTRATOR' | 'DRIVER';
  active: boolean;
  version: number;
}
export class AdministrationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function userChangeEffects(
  before: UserSummary,
  after: UserSummary,
  passwordChanged: boolean,
) {
  return {
    revokeSessions:
      before.role !== after.role || passwordChanged || (before.active && !after.active),
    action:
      before.active && !after.active ? ('USER_DEACTIVATED' as const) : ('USER_UPDATED' as const),
  };
}
export function assertUserRouteChange(
  before: UserSummary,
  after: UserSummary,
  routeStates: readonly string[],
) {
  if (
    before.role === 'DRIVER' &&
    (!after.active || after.role !== 'DRIVER') &&
    routeStates.some((state) => state !== 'CLOSED')
  )
    throw new AdministrationError(
      'USER_ACTIVE_ROUTE',
      'Close or reassign the active route before changing this Driver.',
    );
}
export function userAuditSnapshot(user: UserSummary) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    version: user.version,
  };
}
export async function hashUserPassword(password: string) {
  if (password.length < 12 || password.length > 1024)
    throw new AdministrationError('PASSWORD_INVALID', 'Passwords must contain 12–1024 characters.');
  return argon2.hash(password, { type: argon2.argon2id });
}
export function passwordNeedsRehash(hash: string) {
  return !hash.startsWith('$argon2id$') || argon2.needsRehash(hash);
}
export function validateBusinessSettingChange(settings: {
  currencyCode: string;
  currencyScale: number;
  businessTimezone: string;
  partnerShareRate: string;
  moneyRoundingMode: string;
}) {
  if (
    !/^[A-Z]{3}$/.test(settings.currencyCode) ||
    settings.currencyScale !== 2 ||
    settings.partnerShareRate !== '0.500000' ||
    settings.moneyRoundingMode !== 'HALF_AWAY_FROM_ZERO'
  )
    throw new AdministrationError(
      'BUSINESS_SETTING_INVALID',
      'Currency, monetary scale, partner share, or rounding settings are invalid.',
    );
  try {
    if (
      !settings.businessTimezone ||
      settings.businessTimezone.length > 100 ||
      /^[+-]/.test(settings.businessTimezone)
    )
      throw new Error('Expected IANA timezone');
    Temporal.Now.instant().toZonedDateTimeISO(settings.businessTimezone);
  } catch {
    throw new AdministrationError(
      'BUSINESS_TIMEZONE_INVALID',
      'Use a valid IANA business timezone.',
    );
  }
}
interface OverviewSource {
  grossTotal: string;
  lowStockCount: number;
  routes: Array<{ id: string; driverId: string; state: string }>;
}
export function composeRoleOverview(
  principal: Pick<UserSummary, 'id' | 'role'>,
  source: OverviewSource,
) {
  if (principal.role === 'ADMINISTRATOR')
    return {
      grossTotal: source.grossTotal,
      lowStockCount: source.lowStockCount,
      routes: source.routes,
      actions: [
        '/inventory',
        '/routes',
        '/customers',
        '/cash-closes',
        '/reports',
        '/users',
        '/settings',
      ],
    };
  return {
    routes: source.routes.filter(
      (route) => route.driverId === principal.id && route.state !== 'CLOSED',
    ),
    actions: ['/sales/new', '/routes', '/sales', '/settings'],
  };
}

import type { SessionPrincipal } from './session-store.js';

export const isAdministrator = (principal: SessionPrincipal): boolean =>
  principal.role === 'ADMINISTRATOR';
export const ownsDriverResource = (principal: SessionPrincipal, driverId: string): boolean =>
  principal.role === 'ADMINISTRATOR' || principal.id === driverId;

export function assertResourceScope(principal: SessionPrincipal, driverId: string): void {
  if (!ownsDriverResource(principal, driverId)) {
    const error = new Error('Resource is outside the authenticated scope');
    Object.assign(error, { status: 403, code: 'RESOURCE_FORBIDDEN' });
    throw error;
  }
}

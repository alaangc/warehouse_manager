import type { Selectable, Transaction } from 'kysely';
import type { Database, RouteTable } from '../../db/types.js';

export function toRouteResource(route: Selectable<RouteTable>) {
  return {
    id: route.id,
    routeNumber: route.route_number,
    state: route.state,
    originLocationId: route.origin_location_id,
    driverId: route.driver_id,
    vehicleId: route.vehicle_id,
    businessDate: route.business_date,
    createdBy: route.created_by,
    createdAt: new Date(route.created_at).toISOString(),
    startedAt: route.started_at ? new Date(route.started_at).toISOString() : null,
    returnedAt: route.returned_at ? new Date(route.returned_at).toISOString() : null,
    closedAt: route.closed_at ? new Date(route.closed_at).toISOString() : null,
    closedBy: route.closed_by,
    version: route.version,
  };
}

export class RouteRepository {
  constructor(private readonly database: Transaction<Database>) {}
  async list(principal: { id: string; role: 'ADMINISTRATOR' | 'DRIVER' }) {
    let query = this.database
      .selectFrom('route')
      .selectAll()
      .orderBy('business_date desc')
      .limit(100);
    if (principal.role === 'DRIVER') query = query.where('driver_id', '=', principal.id);
    return (await query.execute()).map(toRouteResource);
  }
  async detail(id: string, principal: { id: string; role: 'ADMINISTRATOR' | 'DRIVER' }) {
    let query = this.database.selectFrom('route').selectAll().where('id', '=', id);
    if (principal.role === 'DRIVER') query = query.where('driver_id', '=', principal.id);
    const route = await query.executeTakeFirst();
    if (route) return toRouteResource(route);
    if (principal.role === 'DRIVER') {
      const exists = await this.database
        .selectFrom('route')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (exists)
        throw Object.assign(new Error('Drivers may only access their assigned routes'), {
          code: 'ROUTE_FORBIDDEN',
        });
    }
    return undefined;
  }
}

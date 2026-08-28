import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { runRouteCommand, type RouteCommandContext } from './route-command.js';
import { assertAssignedDriver, nextRouteState } from './route-domain.js';

export class RouteTransitionService {
  constructor(private readonly database: AppDatabase) {}
  transition(
    routeId: string,
    action: 'START' | 'RETURN',
    expectedVersion: number,
    context: RouteCommandContext,
  ) {
    return runSerializable(this.database, async (transaction) =>
      runRouteCommand(
        transaction,
        {
          operationType: `ROUTE_${action}`,
          resourceType: 'ROUTE',
          request: { routeId, action, expectedVersion },
          context,
        },
        async () => {
          const route = await transaction
            .selectFrom('route')
            .selectAll()
            .where('id', '=', routeId)
            .forUpdate()
            .executeTakeFirst();
          if (!route)
            throw Object.assign(new Error('Route not found'), { code: 'RESOURCE_NOT_FOUND' });
          assertAssignedDriver(context.actorId, route.driver_id);
          const next = nextRouteState(route.state, action);
          if (action === 'START') {
            const load = await transaction
              .selectFrom('route_load')
              .select('state')
              .where('route_id', '=', routeId)
              .executeTakeFirst();
            if (load?.state !== 'CONFIRMED')
              throw Object.assign(new Error('Confirmed load is required'), {
                code: 'LOAD_NOT_CONFIRMED',
              });
          }
          const now = new Date();
          const updated = await transaction
            .updateTable('route')
            .set({
              state: next,
              ...(action === 'START' ? { started_at: now } : { returned_at: now }),
              version: expectedVersion + 1,
            })
            .where('id', '=', routeId)
            .where('state', '=', route.state)
            .where('version', '=', expectedVersion)
            .returningAll()
            .executeTakeFirst();
          if (!updated)
            throw Object.assign(new Error('Route changed concurrently'), {
              code: 'OPTIMISTIC_CONFLICT',
            });
          await new AuditWriter().write(transaction, {
            actorId: context.actorId,
            action: 'ROUTE_CHANGED',
            entityType: 'ROUTE',
            entityId: routeId,
            before: { state: route.state },
            after: { state: next },
            requestId: context.requestId,
          });
          return updated;
        },
      ),
    );
  }
}

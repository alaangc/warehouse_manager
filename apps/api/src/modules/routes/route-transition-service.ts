import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { runRouteCommand, type RouteCommandContext } from './route-command.js';
import { assertAssignedDriver, nextRouteState } from './route-domain.js';
import { recordDriverReturn } from './route-return.js';
import type { ReconciliationInput } from './route-reconciliation-service.js';

export class RouteTransitionService {
  constructor(private readonly database: AppDatabase) {}
  transition(
    routeId: string,
    action: 'START' | 'RETURN' | 'DECLARE_RETURN',
    expectedVersion: number,
    context: RouteCommandContext,
    lines?: ReconciliationInput['lines'],
  ) {
    return runSerializable(this.database, async (transaction) =>
      runRouteCommand(
        transaction,
        {
          operationType: `ROUTE_${action}`,
          resourceType: 'ROUTE',
          request: {
            routeId,
            action,
            expectedVersion,
            ...(lines
              ? {
                  lines: lines.map((line) => ({
                    ...line,
                    differenceReason: line.differenceReason ?? null,
                  })),
                }
              : {}),
          },
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
          if (action === 'DECLARE_RETURN') {
            const approved = await transaction
              .selectFrom('route_reconciliation')
              .select('id')
              .where('route_id', '=', routeId)
              .executeTakeFirst();
            const declared = await transaction
              .selectFrom('route_return')
              .select('id')
              .where('route_id', '=', routeId)
              .where('kind', '=', 'DECLARED')
              .executeTakeFirst();
            if (route.state !== 'RETURNED' || approved || declared || !lines)
              throw Object.assign(new Error('Return declaration is no longer editable'), {
                code: 'INVALID_ROUTE_TRANSITION',
              });
          }
          const next =
            action === 'DECLARE_RETURN' ? 'RETURNED' : nextRouteState(route.state, action);
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
          if (action !== 'START' && lines)
            await recordDriverReturn(transaction, route, lines, context.actorId);
          const updated = await transaction
            .updateTable('route')
            .set({
              state: next,
              ...(action === 'START'
                ? { started_at: now }
                : action === 'RETURN'
                  ? { returned_at: now }
                  : {}),
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

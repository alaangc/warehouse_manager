import { sql, type Transaction } from 'kysely';
import type { Database, RouteReturnSnapshot } from '../../db/types.js';
import { calculateReconciliationLine } from './route-domain.js';
import type { ReconciliationInput } from './route-reconciliation-service.js';

export async function recordDriverReturn(
  db: Transaction<Database>,
  route: { id: string; route_number: string },
  lines: ReconciliationInput['lines'],
  actorId: string,
) {
  const loaded = await db
    .selectFrom('route_load_line as line')
    .innerJoin('route_load as load', 'load.id', 'line.route_load_id')
    .selectAll('line')
    .where('load.route_id', '=', route.id)
    .where('load.state', '=', 'CONFIRMED')
    .orderBy('line.product_id')
    .execute();
  const requested = new Map(lines.map((line) => [line.productId, line]));
  if (
    !loaded.length ||
    requested.size !== lines.length ||
    loaded.length !== lines.length ||
    loaded.some((line) => !requested.has(line.product_id))
  )
    throw Object.assign(new Error('Return must cover each loaded product exactly once'), {
      code: 'RECONCILIATION_LINES_INVALID',
    });
  const snapshot: RouteReturnSnapshot = {
    routeNumber: route.route_number,
    kind: 'DECLARED',
    lines: [],
  };
  for (const line of loaded) {
    const sold = await db
      .selectFrom('sale_line as line')
      .innerJoin('sale', 'sale.id', 'line.sale_id')
      .select(sql<string>`coalesce(sum(line.quantity), 0)::text`.as('quantity'))
      .where('sale.route_id', '=', route.id)
      .where('sale.status', '=', 'COMPLETED')
      .where('line.product_id', '=', line.product_id)
      .executeTakeFirstOrThrow();
    const input = requested.get(line.product_id)!;
    const result = calculateReconciliationLine(
      line.quantity,
      sold.quantity,
      input.physicalReturnQuantity,
    );
    const differs = Number(result.difference) !== 0;
    const reason = input.differenceReason?.trim() || null;
    if (differs && !reason)
      throw Object.assign(new Error('Every difference requires a reason'), {
        code: 'DIFFERENCE_REASON_REQUIRED',
      });
    if (!differs && reason)
      throw Object.assign(new Error('Zero difference cannot have a reason'), {
        code: 'UNEXPECTED_DIFFERENCE_REASON',
      });
    snapshot.lines.push({
      productId: line.product_id,
      productName: line.product_name,
      unitCode: line.unit_code,
      quantity: result.physicalReturn,
      expectedQuantity: result.expectedReturn,
      differenceQuantity: result.difference,
      differenceReason: reason,
    });
  }
  return db
    .insertInto('route_return')
    .values({ route_id: route.id, kind: 'DECLARED', recorded_by: actorId, snapshot })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getReturnDeclaration(
  db: import('../../db/database.js').AppDatabase,
  routeId: string,
) {
  const row = await db
    .selectFrom('route_return')
    .selectAll()
    .where('route_id', '=', routeId)
    .where('kind', '=', 'DECLARED')
    .executeTakeFirst();
  return row
    ? {
        id: row.id,
        recordedBy: row.recorded_by,
        createdAt: row.created_at.toISOString(),
        ...row.snapshot,
      }
    : null;
}

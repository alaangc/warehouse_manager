import { sql, type Transaction } from 'kysely';
import type { Database } from '../../db/types.js';
import { parseExactDecimal } from '../../shared/money.js';

export interface MovementCommand {
  operationId: string;
  productId: string;
  sourceId: string | null;
  destinationId: string | null;
  quantity: string;
  actorId: string;
  reason: string | null;
  relatedEntityType: string;
  relatedEntityId: string;
  reversesMovementId?: string | null;
}

export class InventoryRepository {
  constructor(private readonly transaction: Transaction<Database>) {}

  async branchStockLocation(branchId: string): Promise<string> {
    const row = await this.transaction
      .selectFrom('stock_location')
      .select('id')
      .where('branch_id', '=', branchId)
      .where('kind', '=', 'BRANCH')
      .executeTakeFirst();
    if (!row)
      throw Object.assign(new Error('Branch stock location not found'), {
        code: 'STOCK_LOCATION_NOT_FOUND',
      });
    return row.id;
  }

  async applyMovement(command: MovementCommand) {
    if (command.sourceId === null && command.destinationId === null)
      throw new Error('Movement requires an endpoint');
    const lockIds = [command.sourceId, command.destinationId]
      .filter((id): id is string => id !== null)
      .sort();
    for (const stockLocationId of lockIds) {
      await this.transaction
        .insertInto('inventory_balance')
        .values({
          stock_location_id: stockLocationId,
          product_id: command.productId,
          quantity: '0.000',
        })
        .onConflict((conflict) => conflict.columns(['stock_location_id', 'product_id']).doNothing())
        .execute();
    }
    const balances = await this.transaction
      .selectFrom('inventory_balance')
      .selectAll()
      .where('product_id', '=', command.productId)
      .where('stock_location_id', 'in', lockIds)
      .orderBy('stock_location_id')
      .forUpdate()
      .execute();
    const byLocation = new Map(balances.map((row) => [row.stock_location_id, row]));
    let sourceAfter: string | null = null;
    let destinationAfter: string | null = null;
    if (command.sourceId) {
      const current = byLocation.get(command.sourceId);
      if (!current || parseExactDecimal(current.quantity).lessThan(command.quantity))
        throw Object.assign(new Error('Insufficient inventory'), {
          code: 'INSUFFICIENT_INVENTORY',
        });
      const updated = await this.transaction
        .updateTable('inventory_balance')
        .set({
          quantity: sql`quantity - ${command.quantity}::numeric`,
          updated_at: new Date(),
          version: sql`version + 1`,
        })
        .where('id', '=', current.id)
        .where('quantity', '>=', command.quantity)
        .returning('quantity')
        .executeTakeFirst();
      if (!updated)
        throw Object.assign(new Error('Inventory changed concurrently'), {
          code: 'INVENTORY_CONFLICT',
        });
      sourceAfter = updated.quantity;
    }
    if (command.destinationId) {
      const current = byLocation.get(command.destinationId)!;
      const updated = await this.transaction
        .updateTable('inventory_balance')
        .set({
          quantity: sql`quantity + ${command.quantity}::numeric`,
          updated_at: new Date(),
          version: sql`version + 1`,
        })
        .where('id', '=', current.id)
        .returning('quantity')
        .executeTakeFirstOrThrow();
      destinationAfter = updated.quantity;
    }
    return this.transaction
      .insertInto('inventory_movement')
      .values({
        operation_id: command.operationId,
        product_id: command.productId,
        source_stock_location_id: command.sourceId,
        destination_stock_location_id: command.destinationId,
        quantity: command.quantity,
        source_balance_after: sourceAfter,
        destination_balance_after: destinationAfter,
        actor_id: command.actorId,
        reason: command.reason,
        related_entity_type: command.relatedEntityType,
        related_entity_id: command.relatedEntityId,
        reverses_movement_id: command.reversesMovementId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}

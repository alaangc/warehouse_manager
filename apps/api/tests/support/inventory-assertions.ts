import { expect } from 'vitest';
import type { AppDatabase } from '../../src/db/database.js';
import { parseExactDecimal } from '../../src/shared/money.js';

export async function expectLedgerMatchesBalance(
  database: AppDatabase,
  stockLocationId: string,
  productId: string,
) {
  const balance = await database
    .selectFrom('inventory_balance')
    .select('quantity')
    .where('stock_location_id', '=', stockLocationId)
    .where('product_id', '=', productId)
    .executeTakeFirstOrThrow();
  const movements = await database
    .selectFrom('inventory_movement')
    .select(['source_stock_location_id', 'destination_stock_location_id', 'quantity'])
    .where((eb) =>
      eb.or([
        eb('source_stock_location_id', '=', stockLocationId),
        eb('destination_stock_location_id', '=', stockLocationId),
      ]),
    )
    .where('product_id', '=', productId)
    .execute();
  const reproduced = movements.reduce(
    (sum, movement) =>
      movement.destination_stock_location_id === stockLocationId
        ? sum.plus(parseExactDecimal(movement.quantity))
        : sum.minus(parseExactDecimal(movement.quantity)),
    parseExactDecimal('0'),
  );
  expect(parseExactDecimal(balance.quantity).equals(reproduced)).toBe(true);
}

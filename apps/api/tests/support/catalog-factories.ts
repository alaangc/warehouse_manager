import type { AppDatabase } from '../../src/db/database.js';

export async function createCatalogFixture(database: AppDatabase) {
  const category = await database
    .insertInto('category')
    .values({
      name: `Category ${crypto.randomUUID()}`,
      reporting_group: 'OTHER',
      archived_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const unit = await database
    .insertInto('unit')
    .values({
      code: `U-${crypto.randomUUID()}`,
      name: 'Piece',
      quantity_scale: 0,
      archived_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const product = await database
    .insertInto('product')
    .values({
      sku: `SKU-${crypto.randomUUID()}`,
      name: 'Fixture product',
      description: null,
      category_id: category.id,
      unit_id: unit.id,
      standard_unit_price: '10.0000',
      low_stock_threshold: '2.000',
      archived_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { category, unit, product };
}

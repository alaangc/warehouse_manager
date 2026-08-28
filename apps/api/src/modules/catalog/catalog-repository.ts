import type { Transaction } from 'kysely';
import type { Database } from '../../db/types.js';

export class CatalogRepository {
  constructor(private readonly database: Transaction<Database>) {}

  listProducts(search?: string) {
    let query = this.database.selectFrom('product').selectAll().orderBy('name').limit(100);
    if (search?.trim())
      query = query.where((eb) =>
        eb.or([
          eb('name', 'ilike', `%${search.trim()}%`),
          eb('sku', 'ilike', `%${search.trim()}%`),
        ]),
      );
    return query.execute();
  }

  listLocations() {
    return this.database.selectFrom('location').selectAll().orderBy('name').execute();
  }

  listCategories() {
    return this.database.selectFrom('category').selectAll().orderBy('name').execute();
  }

  listUnits() {
    return this.database.selectFrom('unit').selectAll().orderBy('name').execute();
  }

  listVehicles() {
    return this.database.selectFrom('vehicle').selectAll().orderBy('name').execute();
  }

  async assertVehicleCanBeArchived(vehicleId: string): Promise<void> {
    const activeRoute = await this.database
      .selectFrom('route')
      .select('id')
      .where('vehicle_id', '=', vehicleId)
      .where('state', '!=', 'CLOSED')
      .executeTakeFirst();
    if (activeRoute)
      throw Object.assign(new Error('Vehicle is assigned to an active route'), {
        code: 'VEHICLE_ASSIGNED',
      });
  }

  async requireActiveReferences(categoryId: string, unitId: string): Promise<void> {
    const [category, unit] = await Promise.all([
      this.database
        .selectFrom('category')
        .select('id')
        .where('id', '=', categoryId)
        .where('active', '=', true)
        .executeTakeFirst(),
      this.database
        .selectFrom('unit')
        .select('id')
        .where('id', '=', unitId)
        .where('active', '=', true)
        .executeTakeFirst(),
    ]);
    if (!category || !unit)
      throw Object.assign(new Error('Catalog reference is inactive or missing'), {
        code: 'CATALOG_REFERENCE_INVALID',
      });
  }
}

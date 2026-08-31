import type { Transaction } from 'kysely';
import type { Database } from '../../db/types.js';

type ReportingGroup = Database['category']['reporting_group'];

interface LifecycleUpdate {
  expectedVersion: number;
  active: boolean;
}

export interface LocationInput {
  code: string;
  name: string;
}

export interface CategoryInput {
  name: string;
  reportingGroup: ReportingGroup;
}

export interface UnitInput {
  code: string;
  name: string;
  quantityScale: number;
}

export interface VehicleInput {
  code: string;
  name: string;
  registration?: string | null | undefined;
}

export interface ProductInput {
  sku: string;
  name: string;
  description?: string | null | undefined;
  categoryId: string;
  unitId: string;
  standardUnitPrice: string;
  lowStockThreshold: string;
}

export function normalizeCatalogCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCatalogName(value: string): string {
  return value.trim();
}

export class CatalogRepository {
  constructor(private readonly database: Transaction<Database>) {}

  getLocationForUpdate(id: string) {
    return this.database
      .selectFrom('location')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  getCategoryForUpdate(id: string) {
    return this.database
      .selectFrom('category')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  getUnitForUpdate(id: string) {
    return this.database
      .selectFrom('unit')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  getVehicleForUpdate(id: string) {
    return this.database
      .selectFrom('vehicle')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  getProductForUpdate(id: string) {
    return this.database
      .selectFrom('product')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
  }

  async createLocation(input: LocationInput) {
    const location = await this.database
      .insertInto('location')
      .values({
        code: normalizeCatalogCode(input.code),
        name: normalizeCatalogName(input.name),
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.database
      .insertInto('stock_location')
      .values({ kind: 'BRANCH', branch_id: location.id, route_id: null })
      .execute();
    return location;
  }

  updateLocation(id: string, input: LocationInput & LifecycleUpdate) {
    const now = new Date();
    return this.requireUpdated(
      this.database
        .updateTable('location')
        .set({
          code: normalizeCatalogCode(input.code),
          name: normalizeCatalogName(input.name),
          active: input.active,
          archived_at: input.active ? null : now,
          updated_at: now,
          version: input.expectedVersion + 1,
        })
        .where('id', '=', id)
        .where('version', '=', input.expectedVersion)
        .returningAll()
        .executeTakeFirst(),
      'Location',
    );
  }

  createCategory(input: CategoryInput) {
    return this.database
      .insertInto('category')
      .values({
        name: normalizeCatalogName(input.name),
        reporting_group: input.reportingGroup,
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateCategory(id: string, input: CategoryInput & LifecycleUpdate) {
    const now = new Date();
    return this.requireUpdated(
      this.database
        .updateTable('category')
        .set({
          name: normalizeCatalogName(input.name),
          reporting_group: input.reportingGroup,
          active: input.active,
          archived_at: input.active ? null : now,
          updated_at: now,
          version: input.expectedVersion + 1,
        })
        .where('id', '=', id)
        .where('version', '=', input.expectedVersion)
        .returningAll()
        .executeTakeFirst(),
      'Category',
    );
  }

  createUnit(input: UnitInput) {
    return this.database
      .insertInto('unit')
      .values({
        code: normalizeCatalogCode(input.code),
        name: normalizeCatalogName(input.name),
        quantity_scale: input.quantityScale,
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateUnit(id: string, input: UnitInput & LifecycleUpdate) {
    const now = new Date();
    return this.requireUpdated(
      this.database
        .updateTable('unit')
        .set({
          code: normalizeCatalogCode(input.code),
          name: normalizeCatalogName(input.name),
          quantity_scale: input.quantityScale,
          active: input.active,
          archived_at: input.active ? null : now,
          updated_at: now,
          version: input.expectedVersion + 1,
        })
        .where('id', '=', id)
        .where('version', '=', input.expectedVersion)
        .returningAll()
        .executeTakeFirst(),
      'Unit',
    );
  }

  createVehicle(input: VehicleInput) {
    return this.database
      .insertInto('vehicle')
      .values({
        code: normalizeCatalogCode(input.code),
        name: normalizeCatalogName(input.name),
        registration: input.registration?.trim() || null,
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateVehicle(id: string, input: VehicleInput & LifecycleUpdate) {
    if (!input.active) await this.assertVehicleCanBeArchived(id);
    const now = new Date();
    return this.requireUpdated(
      this.database
        .updateTable('vehicle')
        .set({
          code: normalizeCatalogCode(input.code),
          name: normalizeCatalogName(input.name),
          registration: input.registration?.trim() || null,
          active: input.active,
          archived_at: input.active ? null : now,
          updated_at: now,
          version: input.expectedVersion + 1,
        })
        .where('id', '=', id)
        .where('version', '=', input.expectedVersion)
        .returningAll()
        .executeTakeFirst(),
      'Vehicle',
    );
  }

  async createProduct(input: ProductInput) {
    await this.requireActiveReferences(input.categoryId, input.unitId);
    return this.database
      .insertInto('product')
      .values({
        sku: normalizeCatalogCode(input.sku),
        name: normalizeCatalogName(input.name),
        description: input.description?.trim() || null,
        category_id: input.categoryId,
        unit_id: input.unitId,
        standard_unit_price: input.standardUnitPrice,
        low_stock_threshold: input.lowStockThreshold,
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateProduct(id: string, input: ProductInput & LifecycleUpdate) {
    if (input.active) await this.requireActiveReferences(input.categoryId, input.unitId);
    const now = new Date();
    return this.requireUpdated(
      this.database
        .updateTable('product')
        .set({
          sku: normalizeCatalogCode(input.sku),
          name: normalizeCatalogName(input.name),
          description: input.description?.trim() || null,
          category_id: input.categoryId,
          unit_id: input.unitId,
          standard_unit_price: input.standardUnitPrice,
          low_stock_threshold: input.lowStockThreshold,
          active: input.active,
          archived_at: input.active ? null : now,
          updated_at: now,
          version: input.expectedVersion + 1,
        })
        .where('id', '=', id)
        .where('version', '=', input.expectedVersion)
        .returningAll()
        .executeTakeFirst(),
      'Product',
    );
  }

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

  private async requireUpdated<T>(result: Promise<T | undefined>, entity: string): Promise<T> {
    const updated = await result;
    if (!updated)
      throw Object.assign(new Error(`${entity} changed concurrently or does not exist`), {
        code: 'OPTIMISTIC_CONFLICT',
      });
    return updated;
  }
}

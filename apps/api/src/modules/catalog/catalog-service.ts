import {
  CategoryUpdateSchema,
  CategoryWriteSchema,
  LocationUpdateSchema,
  LocationWriteSchema,
  ProductUpdateSchema,
  ProductWriteSchema,
  UnitUpdateSchema,
  UnitWriteSchema,
  VehicleUpdateSchema,
  VehicleWriteSchema,
} from '@warehouse/contracts';
import type { Selectable, Transaction } from 'kysely';
import type { z } from 'zod';
import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import type {
  CategoryTable,
  Database,
  JsonValue,
  LocationTable,
  ProductTable,
  UnitTable,
  VehicleTable,
} from '../../db/types.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { CatalogRepository } from './catalog-repository.js';

type LocationWriteInput = z.input<typeof LocationWriteSchema>;
type LocationUpdateInput = z.input<typeof LocationUpdateSchema>;
type CategoryWriteInput = z.input<typeof CategoryWriteSchema>;
type CategoryUpdateInput = z.input<typeof CategoryUpdateSchema>;
type UnitWriteInput = z.input<typeof UnitWriteSchema>;
type UnitUpdateInput = z.input<typeof UnitUpdateSchema>;
type VehicleWriteInput = z.input<typeof VehicleWriteSchema>;
type VehicleUpdateInput = z.input<typeof VehicleUpdateSchema>;
type ProductWriteInput = z.input<typeof ProductWriteSchema>;
type ProductUpdateInput = z.input<typeof ProductUpdateSchema>;

type CatalogEntityType = 'LOCATION' | 'CATEGORY' | 'UNIT' | 'VEHICLE' | 'PRODUCT';
type CatalogRow =
  | Selectable<LocationTable>
  | Selectable<CategoryTable>
  | Selectable<UnitTable>
  | Selectable<VehicleTable>
  | Selectable<ProductTable>;

interface LifecycleInput {
  expectedVersion: number;
  active: boolean;
  reason?: string | null | undefined;
}

const auditFields: Record<CatalogEntityType, readonly string[]> = {
  LOCATION: ['code', 'name', 'active', 'archived_at', 'version'],
  CATEGORY: ['name', 'reporting_group', 'active', 'archived_at', 'version'],
  UNIT: ['code', 'name', 'quantity_scale', 'active', 'archived_at', 'version'],
  VEHICLE: ['code', 'name', 'registration', 'active', 'archived_at', 'version'],
  PRODUCT: [
    'sku',
    'name',
    'description',
    'category_id',
    'unit_id',
    'standard_unit_price',
    'low_stock_threshold',
    'active',
    'archived_at',
    'version',
  ],
};

function catalogSnapshot(entityType: CatalogEntityType, row: CatalogRow) {
  const source = row as unknown as Record<string, unknown>;
  const snapshot: Record<string, JsonValue> = {};
  for (const field of auditFields[entityType]) {
    const value = source[field];
    if (value instanceof Date) snapshot[field] = value.toISOString();
    else if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
      snapshot[field] = value as JsonValue;
  }
  return snapshot;
}

export class CatalogService {
  constructor(private readonly database: AppDatabase) {}

  createLocation(input: LocationWriteInput, actorId: string, requestId: string) {
    const parsed = LocationWriteSchema.parse(input);
    return this.createCatalog('LOCATION', actorId, requestId, (repository) =>
      repository.createLocation(parsed),
    );
  }

  updateLocation(id: string, input: LocationUpdateInput, actorId: string, requestId: string) {
    const parsed = LocationUpdateSchema.parse(input);
    return this.updateCatalog(
      'LOCATION',
      parsed,
      actorId,
      requestId,
      (repository) => repository.getLocationForUpdate(id),
      (repository) => repository.updateLocation(id, parsed),
    );
  }

  createCategory(input: CategoryWriteInput, actorId: string, requestId: string) {
    const parsed = CategoryWriteSchema.parse(input);
    return this.createCatalog('CATEGORY', actorId, requestId, (repository) =>
      repository.createCategory(parsed),
    );
  }

  updateCategory(id: string, input: CategoryUpdateInput, actorId: string, requestId: string) {
    const parsed = CategoryUpdateSchema.parse(input);
    return this.updateCatalog(
      'CATEGORY',
      parsed,
      actorId,
      requestId,
      (repository) => repository.getCategoryForUpdate(id),
      (repository) => repository.updateCategory(id, parsed),
    );
  }

  createUnit(input: UnitWriteInput, actorId: string, requestId: string) {
    const parsed = UnitWriteSchema.parse(input);
    return this.createCatalog('UNIT', actorId, requestId, (repository) =>
      repository.createUnit(parsed),
    );
  }

  updateUnit(id: string, input: UnitUpdateInput, actorId: string, requestId: string) {
    const parsed = UnitUpdateSchema.parse(input);
    return this.updateCatalog(
      'UNIT',
      parsed,
      actorId,
      requestId,
      (repository) => repository.getUnitForUpdate(id),
      (repository) => repository.updateUnit(id, parsed),
    );
  }

  createVehicle(input: VehicleWriteInput, actorId: string, requestId: string) {
    const parsed = VehicleWriteSchema.parse(input);
    return this.createCatalog('VEHICLE', actorId, requestId, (repository) =>
      repository.createVehicle(parsed),
    );
  }

  updateVehicle(id: string, input: VehicleUpdateInput, actorId: string, requestId: string) {
    const parsed = VehicleUpdateSchema.parse(input);
    return this.updateCatalog(
      'VEHICLE',
      parsed,
      actorId,
      requestId,
      (repository) => repository.getVehicleForUpdate(id),
      (repository) => repository.updateVehicle(id, parsed),
    );
  }

  createProduct(input: ProductWriteInput, actorId: string, requestId: string) {
    const parsed = ProductWriteSchema.parse(input);
    return this.createCatalog('PRODUCT', actorId, requestId, (repository) =>
      repository.createProduct(parsed),
    );
  }

  updateProduct(id: string, input: ProductUpdateInput, actorId: string, requestId: string) {
    const parsed = ProductUpdateSchema.parse(input);
    return this.updateCatalog(
      'PRODUCT',
      parsed,
      actorId,
      requestId,
      (repository) => repository.getProductForUpdate(id),
      (repository) => repository.updateProduct(id, parsed),
    );
  }

  private createCatalog<T extends CatalogRow>(
    entityType: CatalogEntityType,
    actorId: string,
    requestId: string,
    create: (repository: CatalogRepository) => Promise<T>,
  ): Promise<T> {
    return runSerializable(this.database, async (transaction) => {
      const result = await create(new CatalogRepository(transaction));
      await this.writeAudit(transaction, entityType, result, actorId, requestId);
      return result;
    });
  }

  private updateCatalog<T extends CatalogRow>(
    entityType: CatalogEntityType,
    input: LifecycleInput,
    actorId: string,
    requestId: string,
    findBefore: (repository: CatalogRepository) => Promise<T | undefined>,
    update: (repository: CatalogRepository) => Promise<T>,
  ): Promise<T> {
    return runSerializable(this.database, async (transaction) => {
      const repository = new CatalogRepository(transaction);
      const before = await findBefore(repository);
      this.requireCurrentVersion(before, input.expectedVersion);
      this.requireArchiveReason(before.active, input.active, input.reason);
      const after = await update(repository);
      await this.writeAudit(
        transaction,
        entityType,
        after,
        actorId,
        requestId,
        before,
        input.reason,
      );
      return after;
    });
  }

  private requireCurrentVersion(
    row: CatalogRow | undefined,
    expectedVersion: number,
  ): asserts row is CatalogRow {
    if (!row || row.version !== expectedVersion) {
      throw Object.assign(new Error('Catalog record changed concurrently or does not exist'), {
        code: 'OPTIMISTIC_CONFLICT',
      });
    }
  }

  private requireArchiveReason(
    wasActive: boolean,
    active: boolean,
    reason: string | null | undefined,
  ): void {
    if (wasActive && !active && !reason?.trim()) {
      throw Object.assign(new Error('A reason is required when archiving a catalog record'), {
        code: 'ARCHIVE_REASON_REQUIRED',
      });
    }
  }

  private async writeAudit(
    transaction: Transaction<Database>,
    entityType: CatalogEntityType,
    after: CatalogRow,
    actorId: string,
    requestId: string,
    before?: CatalogRow,
    reason?: string | null,
  ): Promise<void> {
    await new AuditWriter().write(transaction, {
      actorId,
      action: 'CATALOG_CHANGED',
      entityType,
      entityId: after.id,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      ...(before ? { before: catalogSnapshot(entityType, before) } : {}),
      after: catalogSnapshot(entityType, after),
      requestId,
    });
  }
}

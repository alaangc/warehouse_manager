import type { AppDatabase } from '../../db/database.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { CatalogRepository } from './catalog-repository.js';

export class CatalogService {
  constructor(private readonly database: AppDatabase) {}

  async createProduct(
    input: {
      sku: string;
      name: string;
      description?: string | null | undefined;
      categoryId: string;
      unitId: string;
      standardUnitPrice: string;
      lowStockThreshold: string;
    },
    actorId: string,
    requestId: string,
  ) {
    return runSerializable(this.database, async (transaction) => {
      await new CatalogRepository(transaction).requireActiveReferences(
        input.categoryId,
        input.unitId,
      );
      const product = await transaction
        .insertInto('product')
        .values({
          sku: input.sku.trim().toUpperCase(),
          name: input.name.trim(),
          description: input.description ?? null,
          category_id: input.categoryId,
          unit_id: input.unitId,
          standard_unit_price: input.standardUnitPrice,
          low_stock_threshold: input.lowStockThreshold,
          archived_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await new AuditWriter().write(transaction, {
        actorId,
        action: 'CATALOG_CHANGED',
        entityType: 'PRODUCT',
        entityId: product.id,
        after: { sku: product.sku, name: product.name },
        requestId,
      });
      return product;
    });
  }

  requireArchiveReason(active: boolean, reason: string | null | undefined): void {
    if (!active && !reason?.trim()) {
      throw Object.assign(new Error('A reason is required when archiving a catalog record'), {
        code: 'ARCHIVE_REASON_REQUIRED',
      });
    }
  }
}

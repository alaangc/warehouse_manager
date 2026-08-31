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
      const product = await new CatalogRepository(transaction).createProduct(input);
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

import type { AppDatabase } from '../../db/database.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';

export interface CustomerInput {
  displayName: string;
  contactName?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  address?: string | null | undefined;
  city: string;
  notes?: string | null | undefined;
}

export class CustomerService {
  constructor(private readonly database: AppDatabase) {}
  create(input: CustomerInput, actorId: string, requestId: string) {
    return this.database.transaction().execute(async (transaction) => {
      const customer = await transaction
        .insertInto('customer')
        .values({
          customer_number: `C-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          display_name: input.displayName,
          contact_name: input.contactName ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          city: input.city,
          notes: input.notes ?? null,
          archived_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await new AuditWriter().write(transaction, {
        actorId,
        action: 'CATALOG_CHANGED',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        after: { customerNumber: customer.customer_number, displayName: customer.display_name },
        requestId,
      });
      return customer;
    });
  }
  update(
    id: string,
    input: CustomerInput & {
      expectedVersion: number;
      active: boolean;
      reason?: string | null | undefined;
    },
    actorId: string,
    requestId: string,
  ) {
    if (!input.active && !input.reason?.trim())
      throw Object.assign(new Error('Archival reason is required'), {
        code: 'ARCHIVE_REASON_REQUIRED',
      });
    return this.database.transaction().execute(async (transaction) => {
      const before = await transaction
        .selectFrom('customer')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!before)
        throw Object.assign(new Error('Customer not found'), { code: 'RESOURCE_NOT_FOUND' });
      const customer = await transaction
        .updateTable('customer')
        .set({
          display_name: input.displayName,
          contact_name: input.contactName ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          city: input.city,
          notes: input.notes ?? null,
          active: input.active,
          archived_at: input.active ? null : new Date(),
          updated_at: new Date(),
          version: input.expectedVersion + 1,
        })
        .where('id', '=', id)
        .where('version', '=', input.expectedVersion)
        .returningAll()
        .executeTakeFirst();
      if (!customer)
        throw Object.assign(new Error('Customer changed concurrently'), {
          code: 'OPTIMISTIC_CONFLICT',
        });
      await new AuditWriter().write(transaction, {
        actorId,
        action: 'CATALOG_CHANGED',
        entityType: 'CUSTOMER',
        entityId: id,
        ...(input.reason ? { reason: input.reason } : {}),
        before: {
          displayName: before.display_name,
          city: before.city,
          active: before.active,
          version: before.version,
        },
        after: { active: customer.active, version: customer.version },
        requestId,
      });
      return customer;
    });
  }
}

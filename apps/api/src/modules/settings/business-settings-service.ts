import type { Selectable } from 'kysely';
import type { AppDatabase } from '../../db/database.js';
import type { BusinessSettingTable } from '../../db/types.js';
import { runSerializable } from '../../db/serializable-transaction.js';
import { AuditWriter } from '../../shared/audit/audit-service.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { requireVersion, type AdministrationContext } from '../users/user-admin-service.js';
import { validateBusinessSettingChange } from '../users/user-domain.js';

const settingId = '00000000-0000-4000-8000-000000000001';
function resource(row: Selectable<BusinessSettingTable>) {
  return {
    id: row.id,
    currencyCode: row.currency_code.trim(),
    currencyScale: row.currency_scale,
    businessTimezone: row.business_timezone,
    partnerShareRate: row.partner_share_rate,
    moneyRoundingMode: row.money_rounding_mode,
    version: row.version,
  };
}
export class BusinessSettingsService {
  constructor(private readonly database: AppDatabase) {}
  async get() {
    return resource(
      await this.database
        .selectFrom('business_setting')
        .selectAll()
        .where('id', '=', settingId)
        .executeTakeFirstOrThrow(),
    );
  }
  async update(
    input: {
      expectedVersion: number;
      currencyCode: string;
      businessTimezone: string;
      reason: string;
    },
    context: AdministrationContext,
  ) {
    if (!input.reason.trim()) throw new HttpProblem(422, 'REASON_REQUIRED', 'Validation Failed');
    return runSerializable(this.database, async (transaction) => {
      const row = await transaction
        .selectFrom('business_setting')
        .selectAll()
        .where('id', '=', settingId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      requireVersion(row.version, input.expectedVersion);
      const before = resource(row);
      const after = {
        ...before,
        currencyCode: input.currencyCode,
        businessTimezone: input.businessTimezone,
        version: row.version + 1,
      };
      validateBusinessSettingChange(after);
      await transaction
        .updateTable('business_setting')
        .set({
          currency_code: after.currencyCode,
          business_timezone: after.businessTimezone,
          updated_by: context.actorId,
          updated_at: new Date(),
          version: after.version,
        })
        .where('id', '=', settingId)
        .execute();
      // Existing Sale/CashClose/ReportSnapshot rows carry their own immutable inputs.
      await new AuditWriter().write(transaction, {
        ...context,
        entityType: 'BUSINESS_SETTING',
        entityId: settingId,
        action: 'SETTING_UPDATED',
        reason: input.reason,
        before,
        after,
      });
      return after;
    });
  }
}

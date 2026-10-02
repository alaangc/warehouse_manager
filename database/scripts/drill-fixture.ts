import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedFoundation } from '../seeds/001_foundation.js';
import type { AppDatabase } from '../../apps/api/src/db/database.js';
import { CatalogService } from '../../apps/api/src/modules/catalog/catalog-service.js';
import { CustomerService } from '../../apps/api/src/modules/customers/customer-service.js';
import { InventoryService } from '../../apps/api/src/modules/inventory/inventory-service.js';
import { RouteLoadService } from '../../apps/api/src/modules/routes/route-load-service.js';
import { RouteTransitionService } from '../../apps/api/src/modules/routes/route-transition-service.js';
import { RouteReconciliationService } from '../../apps/api/src/modules/routes/route-reconciliation-service.js';
import { PrinterSettingsService } from '../../apps/api/src/modules/printers/printer-settings-service.js';
import { SaleService } from '../../apps/api/src/modules/sales/sale-service.js';
import { CashCloseService } from '../../apps/api/src/modules/reports/cash-close-service.js';

/** Synthetic, small production-shaped history; not the performance acceptance dataset. */
export async function seedDrill(database: AppDatabase) {
  await seedFoundation(database);
  const admin = '00000000-0000-4000-8000-000000000010';
  const driver = '00000000-0000-4000-8000-000000000011';
  const branch = '00000000-0000-4000-8000-000000000020';
  const context = (actorId = admin) => ({
    actorId,
    requestId: randomUUID(),
    idempotencyKey: randomUUID(),
  });
  const catalog = new CatalogService(database);
  const category = await catalog.createCategory(
    { name: 'Recovery category', reportingGroup: 'OTHER' },
    admin,
    randomUUID(),
  );
  const unit = await catalog.createUnit(
    { code: 'DRILL', name: 'Piece', quantityScale: 0 },
    admin,
    randomUUID(),
  );
  const product = await catalog.createProduct(
    {
      sku: 'DRILL',
      name: 'Recovery product',
      categoryId: category.id,
      unitId: unit.id,
      standardUnitPrice: '12.3456',
      lowStockThreshold: '2',
    },
    admin,
    randomUUID(),
  );
  const vehicle = await catalog.createVehicle(
    { code: 'DRILL', name: 'Recovery vehicle' },
    admin,
    randomUUID(),
  );
  const customer = await new CustomerService(database).create(
    { displayName: 'Synthetic recovery customer', city: 'Test city' },
    admin,
    randomUUID(),
  );
  await new InventoryService(database).createBranchOperation(
    {
      operationType: 'ENTRY',
      branchId: branch,
      reason: 'Recovery fixture',
      lines: [{ productId: product.id, quantity: '100' }],
    },
    context(),
  );
  const loads = new RouteLoadService(database);
  const route = await loads.create(
    {
      originLocationId: branch,
      driverId: driver,
      vehicleId: vehicle.id,
      businessDate: '2026-09-13',
    },
    context(),
  );
  const draft = await loads.saveDraft(
    route.id,
    route.version,
    [{ productId: product.id, quantity: '10' }],
    context(driver),
  );
  await loads.confirm(route.id, draft.version, context(driver));
  const transitions = new RouteTransitionService(database);
  const startedRoute = await transitions.transition(
    route.id,
    'START',
    route.version,
    context(driver),
  );
  const command = {
    clientOperationId: randomUUID(),
    customerId: customer.id,
    routeId: route.id,
    paymentMethod: 'CASH' as const,
    lines: [{ productId: product.id, quantity: '2' }],
  };
  const saleContext = context(driver);
  const sales = new SaleService(database);
  const sale = await sales.confirm(command, saleContext);
  assert.deepEqual(
    await sales.confirm(command, saleContext),
    sale,
    'Sale replay must remain exact',
  );
  const period = {
    periodKind: 'DAY' as const,
    anchorDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo' }).format(
      new Date(),
    ),
  };
  const returned = await transitions.transition(
    route.id,
    'RETURN',
    startedRoute.version,
    context(driver),
  );
  const reconciliations = new RouteReconciliationService(database);
  await reconciliations.approve(
    route.id,
    {
      expectedVersion: returned.version,
      lines: [
        {
          productId: product.id,
          physicalReturnQuantity: '7',
          differenceReason: 'Synthetic recovery shortage',
        },
      ],
    },
    context(),
  );
  await reconciliations.close(route.id, returned.version, context());
  const closes = new CashCloseService(database);
  const close = await closes.create(period, context());
  await closes.correct(close.id, 'Synthetic recovery correction', context());
  return {
    admin,
    driver,
    productId: product.id,
    customerId: customer.id,
    command,
    saleContext,
    sale,
  };
}

export async function seedPrinterHistory(database: AppDatabase) {
  const printers = new PrinterSettingsService(database);
  const context = { actorId: '00000000-0000-4000-8000-000000000010', requestId: randomUUID() };
  const profile = await printers.create(
    {
      name: 'Synthetic drill printer',
      model: 'No physical device',
      serviceUuid: 'ffe0',
      writeCharacteristicUuid: 'ffe1',
      writeMode: 'WITH_RESPONSE',
      commandDialect: 'ESC_POS',
      paperWidthMm: 58,
      encoding: 'CP850',
      maxChunkBytes: 20,
      interChunkDelayMs: 0,
    },
    context,
  );
  await printers.setPreference({ printerProfileId: profile.id }, context);
  await printers.recordTestPrint(
    {
      mode: 'TEST_PRINT',
      printerProfileId: profile.id,
      state: 'FAILED',
      errorCode: 'SYNTHETIC_DRILL',
    },
    context,
  );
}

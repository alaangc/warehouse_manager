import type { ColumnType, Generated } from 'kysely';

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface BusinessSettingTable {
  id: string;
  currency_code: string;
  currency_scale: number;
  business_timezone: string;
  partner_share_rate: string;
  money_rounding_mode: string;
  updated_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface UserTable {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: 'ADMINISTRATOR' | 'DRIVER';
  active: boolean;
  archived_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}

export interface AuthSessionTable {
  id: string;
  user_id: string;
  csrf_secret_hash: string;
  data: JsonValue;
  created_at: Timestamp;
  last_seen_at: Timestamp;
  idle_expires_at: Timestamp;
  absolute_expires_at: Timestamp;
  revoked_at: Timestamp | null;
  revoked_reason: string | null;
}

export interface IdempotencyRequestTable {
  id: Generated<string>;
  actor_id: string;
  operation_type: string;
  idempotency_key: string;
  request_hash: string;
  state: 'IN_PROGRESS' | 'COMPLETED';
  resource_type: string | null;
  resource_id: string | null;
  http_status: number | null;
  response_snapshot: JsonValue | null;
  created_at: Timestamp;
  completed_at: Timestamp | null;
}

export interface AuditEventTable {
  id: Generated<string>;
  actor_id: string;
  occurred_at: Timestamp;
  action: string;
  entity_type: string;
  entity_id: string;
  reason: string | null;
  before_values: JsonValue | null;
  after_values: JsonValue | null;
  operation_id: string | null;
  request_id: string | null;
}

export interface CatalogBase {
  id: Generated<string>;
  active: Generated<boolean>;
  archived_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  version: Generated<number>;
}
export interface LocationTable extends CatalogBase {
  code: string;
  name: string;
}
export interface CategoryTable extends CatalogBase {
  name: string;
  reporting_group: 'SODAS' | 'CHARCOAL' | 'TOSTADAS' | 'OTHER';
}
export interface UnitTable extends CatalogBase {
  code: string;
  name: string;
  quantity_scale: number;
}
export interface ProductTable extends CatalogBase {
  sku: string;
  name: string;
  description: string | null;
  category_id: string;
  unit_id: string;
  standard_unit_price: string;
  low_stock_threshold: string;
}
export interface VehicleTable extends CatalogBase {
  code: string;
  name: string;
  registration: string | null;
}
export interface RouteTable {
  id: Generated<string>;
  route_number: string;
  state: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';
  origin_location_id: string;
  driver_id: string;
  vehicle_id: string;
  business_date: string;
  created_by: string;
  created_at: Timestamp;
  started_at: Timestamp | null;
  returned_at: Timestamp | null;
  closed_at: Timestamp | null;
  closed_by: string | null;
  version: Generated<number>;
}
export interface StockLocationTable {
  id: Generated<string>;
  kind: 'BRANCH' | 'ROUTE';
  branch_id: string | null;
  route_id: string | null;
}
export interface InventoryBalanceTable {
  id: Generated<string>;
  stock_location_id: string;
  product_id: string;
  quantity: string;
  updated_at: Timestamp;
  version: Generated<number>;
}
export type InventoryOperationType =
  | 'ENTRY'
  | 'MANUAL_EXIT'
  | 'TRANSFER'
  | 'ROUTE_LOAD'
  | 'SALE'
  | 'ROUTE_RETURN'
  | 'POSITIVE_ADJUSTMENT'
  | 'NEGATIVE_ADJUSTMENT'
  | 'SALE_CANCELLATION';
export interface InventoryOperationTable {
  id: Generated<string>;
  operation_type: InventoryOperationType;
  actor_id: string;
  reason: string | null;
  related_entity_type: string;
  related_entity_id: string;
  idempotency_request_id: string | null;
  occurred_at: Timestamp;
  reverses_operation_id: string | null;
}
export interface InventoryMovementTable {
  id: Generated<string>;
  operation_id: string;
  product_id: string;
  source_stock_location_id: string | null;
  destination_stock_location_id: string | null;
  quantity: string;
  source_balance_after: string | null;
  destination_balance_after: string | null;
  actor_id: string;
  occurred_at: Timestamp;
  reason: string | null;
  related_entity_type: string;
  related_entity_id: string;
  reverses_movement_id: string | null;
}
export interface CustomerTable extends CatalogBase {
  customer_number: string;
  display_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string;
  notes: string | null;
}
export interface CustomerPriceTable {
  id: Generated<string>;
  customer_id: string;
  product_id: string;
  unit_price: string;
  valid_from: Timestamp;
  valid_to: Timestamp | null;
  active: Generated<boolean>;
  created_by: string;
  created_at: Timestamp;
}
export interface SaleTable {
  id: Generated<string>;
  sale_number: string;
  client_operation_id: string;
  status: 'COMPLETED' | 'CANCELLED';
  customer_id: string;
  driver_id: string;
  route_id: string;
  origin_location_id: string;
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'CARD';
  currency_code: string;
  subtotal: string;
  total: string;
  rounding_mode: 'HALF_AWAY_FROM_ZERO';
  completed_at: Timestamp;
  inventory_operation_id: string;
  idempotency_request_id: string;
  cancelled_at: Timestamp | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
}
export interface SaleLineTable {
  id: Generated<string>;
  sale_id: string;
  sequence: number;
  product_id: string;
  customer_price_id: string | null;
  product_name: string;
  category_name: string;
  reporting_group: 'SODAS' | 'CHARCOAL' | 'TOSTADAS' | 'OTHER';
  unit_code: string;
  quantity: string;
  unit_price: string;
  line_amount: string;
  applied_price_source: 'CUSTOMER' | 'STANDARD';
}
export interface SaleTicketTable {
  id: Generated<string>;
  ticket_number: string;
  sale_id: string;
  printable_snapshot: JsonValue;
  content_version: string;
  created_at: Timestamp;
}
export interface SaleCancellationTable {
  id: Generated<string>;
  sale_id: string;
  actor_id: string;
  reason: string;
  destination_stock_location_id: string;
  inventory_operation_id: string;
  idempotency_request_id: string;
  created_at: Timestamp;
}
export interface RouteLoadTable {
  id: Generated<string>; route_id: string; state: 'DRAFT' | 'CONFIRMED'; recorded_by: string;
  confirmed_at: Timestamp | null; inventory_operation_id: string | null; created_at: Timestamp;
  updated_at: Timestamp; version: Generated<number>;
}
export interface RouteLoadLineTable {
  id: Generated<string>; route_load_id: string; product_id: string; quantity: string;
  product_name: string; unit_code: string; quantity_scale: number;
}
export interface RouteReconciliationTable {
  id: Generated<string>; route_id: string; state: 'DRAFT' | 'APPROVED'; recorded_by: string;
  approved_by: string | null; approved_at: Timestamp | null; return_operation_id: string | null;
  created_at: Timestamp; updated_at: Timestamp; version: Generated<number>;
}
export interface RouteReconciliationLineTable {
  id: Generated<string>; route_reconciliation_id: string; product_id: string; loaded_quantity: string;
  sold_quantity: string; expected_return_quantity: string; physical_return_quantity: string;
  difference_quantity: string; difference_reason: string | null; adjustment_movement_id: string | null;
  product_name: string; unit_code: string;
}

export interface Database {
  business_setting: BusinessSettingTable;
  app_user: UserTable;
  auth_session: AuthSessionTable;
  idempotency_request: IdempotencyRequestTable;
  audit_event: AuditEventTable;
  location: LocationTable;
  category: CategoryTable;
  unit: UnitTable;
  product: ProductTable;
  vehicle: VehicleTable;
  route: RouteTable;
  stock_location: StockLocationTable;
  inventory_balance: InventoryBalanceTable;
  inventory_operation: InventoryOperationTable;
  inventory_movement: InventoryMovementTable;
  customer: CustomerTable;
  customer_price: CustomerPriceTable;
  sale: SaleTable;
  sale_line: SaleLineTable;
  sale_ticket: SaleTicketTable;
  sale_cancellation: SaleCancellationTable;
  route_load: RouteLoadTable;
  route_load_line: RouteLoadLineTable;
  route_reconciliation: RouteReconciliationTable;
  route_reconciliation_line: RouteReconciliationLineTable;
}

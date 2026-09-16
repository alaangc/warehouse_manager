export interface paths {
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get health */
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Login */
    post: operations['login'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/session': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get session */
    get: operations['getSession'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Logout */
    post: operations['logout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/overview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get role overview */
    get: operations['getRoleOverview'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/users': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List users */
    get: operations['listUsers'];
    put?: never;
    /** Create user */
    post: operations['createUser'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/users/{userId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: components['parameters']['UserId'];
      };
      cookie?: never;
    };
    /** Get user */
    get: operations['getUser'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update user */
    patch: operations['updateUser'];
    trace?: never;
  };
  '/locations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List locations */
    get: operations['listLocations'];
    put?: never;
    /** Create location */
    post: operations['createLocation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/categories': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List categories */
    get: operations['listCategories'];
    put?: never;
    /** Create category */
    post: operations['createCategory'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/units': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List units */
    get: operations['listUnits'];
    put?: never;
    /** Create unit */
    post: operations['createUnit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/products': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List products */
    get: operations['listProducts'];
    put?: never;
    /** Create product */
    post: operations['createProduct'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/products/{productId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        productId: components['parameters']['ProductId'];
      };
      cookie?: never;
    };
    /** Get product */
    get: operations['getProduct'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update product */
    patch: operations['updateProduct'];
    trace?: never;
  };
  '/customers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List customers */
    get: operations['listCustomers'];
    put?: never;
    /** Create customer */
    post: operations['createCustomer'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/customers/{customerId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        customerId: components['parameters']['CustomerId'];
      };
      cookie?: never;
    };
    /** Get customer */
    get: operations['getCustomer'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update customer */
    patch: operations['updateCustomer'];
    trace?: never;
  };
  '/customers/{customerId}/prices': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        customerId: components['parameters']['CustomerId'];
      };
      cookie?: never;
    };
    /** List customer prices */
    get: operations['listCustomerPrices'];
    put?: never;
    /** Create customer price */
    post: operations['createCustomerPrice'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/customers/{customerId}/sales': {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        customerId: components['parameters']['CustomerId'];
      };
      cookie?: never;
    };
    /** List customer sales */
    get: operations['listCustomerSales'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/vehicles': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List vehicles */
    get: operations['listVehicles'];
    put?: never;
    /** Create vehicle */
    post: operations['createVehicle'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/printer-profiles': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List printer profiles */
    get: operations['listPrinterProfiles'];
    put?: never;
    /** Create printer profile */
    post: operations['createPrinterProfile'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/me/printer-preference': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get my printer preference */
    get: operations['getMyPrinterPreference'];
    /** Set my printer preference */
    put: operations['setMyPrinterPreference'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/inventory/balances': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List inventory balances */
    get: operations['listInventoryBalances'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/inventory/movements': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List inventory movements
     * @description Administrators may query all permitted inventory movements. Drivers may query movements only for routes assigned to them, including Returned and Closed routes; branch-wide, general-inventory, and unrelated-route movements are forbidden. Query parameters never broaden the authenticated caller's scope.
     */
    get: operations['listInventoryMovements'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/inventory/operations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create inventory operation
     * @description Administrator-only entry, manual exit, or positive/negative adjustment. Transfers use the dedicated endpoint.
     */
    post: operations['createInventoryOperation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/inventory/transfers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create inventory transfer */
    post: operations['createInventoryTransfer'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/inventory/operations/{operationId}/reversal': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        operationId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Reverse inventory operation
     * @description Appends an administrator-authorized compensating operation and movements; never edits the original operation or ledger rows.
     */
    post: operations['reverseInventoryOperation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/routes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List routes
     * @description Administrators may list all routes. Drivers receive every route assigned to them, including Returned and Closed history. A Driver-provided filter cannot expand visibility to another Driver's routes.
     */
    get: operations['listRoutes'];
    put?: never;
    /** Create route */
    post: operations['createRoute'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/routes/{routeId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    /**
     * Get route
     * @description Administrators may retrieve any route. Drivers may retrieve only routes assigned to them, in any state; another Driver's route is forbidden.
     */
    get: operations['getRoute'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/routes/{routeId}/load': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    get?: never;
    /**
     * Replace route load draft
     * @description Assigned driver records the complete draft load while route is Preparing.
     */
    put: operations['replaceRouteLoadDraft'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/routes/{routeId}/load/confirmation': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Confirm route load */
    post: operations['confirmRouteLoad'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/routes/{routeId}/start': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Start route */
    post: operations['startRoute'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/routes/{routeId}/return': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Return route */
    post: operations['returnRoute'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/routes/{routeId}/reconciliation': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    get?: never;
    /**
     * Approve route reconciliation
     * @description Administrator records physical returns, provides mandatory reasons for differences, creates adjustments, and returns stock to the origin atomically.
     */
    put: operations['approveRouteReconciliation'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/routes/{routeId}/close': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Close route */
    post: operations['closeRoute'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sales': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List sales
     * @description Administrators may list all sales. Drivers receive only sales attributed to their authenticated identity, including preserved cancellation status. A Driver-provided filter cannot expand visibility to another Driver's sales.
     */
    get: operations['listSales'];
    put?: never;
    /**
     * Confirm sale
     * @description Assigned driver confirms a sale against products in an En Route route. Price, totals, sale, sale ticket, movements, and idempotency result commit atomically.
     */
    post: operations['confirmSale'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sales/quote': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Quote sale
     * @description Returns advisory effective prices and current route availability without committing a sale. Sale confirmation recalculates and revalidates everything.
     */
    post: operations['quoteSale'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sales/{saleId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        saleId: components['parameters']['SaleId'];
      };
      cookie?: never;
    };
    /**
     * Get sale
     * @description Administrators may retrieve any sale. Drivers may retrieve only a sale attributed to them; another Driver's sale is forbidden.
     */
    get: operations['getSale'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/sales/{saleId}/cancellation': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        saleId: components['parameters']['SaleId'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Cancel sale */
    post: operations['cancelSale'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/cash-closes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List cash closes
     * @description Lists immutable cash-close versions. Administrators may filter by the calendar period resolved in the configured business timezone and by whether a version is current or superseded.
     */
    get: operations['listCashCloses'];
    put?: never;
    /** Create cash close */
    post: operations['createCashClose'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/cash-closes/{cashCloseId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        cashCloseId: components['parameters']['CashCloseId'];
      };
      cookie?: never;
    };
    /** Get cash close */
    get: operations['getCashClose'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/cash-closes/{cashCloseId}/corrections': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        cashCloseId: components['parameters']['CashCloseId'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Correct cash close
     * @description Creates an immutable successor for the current close of the same exact reporting period and atomically makes the successor current. The superseded close remains readable; stale or branching correction attempts conflict.
     */
    post: operations['correctCashClose'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/sales-by-driver': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get sales by driver report */
    get: operations['getSalesByDriverReport'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/best-selling-products': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get best selling products report */
    get: operations['getBestSellingProductsReport'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/inventory-by-branch': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get inventory by branch report */
    get: operations['getInventoryByBranchReport'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reports/financial-summary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get financial summary report */
    get: operations['getFinancialSummaryReport'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/report-snapshots': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create report snapshot
     * @description Persists an immutable report result before canonical PDF generation.
     */
    post: operations['createReportSnapshot'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/documents': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List documents
     * @description Administrators see all document history. Drivers see only Tickets sourced from their own Sales and confirmed Route Loads for Routes assigned to them, regardless of who created the output. Filters and opaque cursors only narrow that source-derived scope and never broaden it. Results use stable keyset ordering by createdAt DESC, id DESC.
     */
    get: operations['listDocuments'];
    put?: never;
    /**
     * Request document
     * @description Creates or reuses a portable canonical PDF from an already committed source record. TICKET, ROUTE_LOAD, CASH_CLOSE, and REPORT are all supported; ROUTE_LOAD requires a confirmed immutable load. Administrators may request all four types. Drivers may request only a TICKET whose Sale belongs to them or a confirmed ROUTE_LOAD whose Route is assigned to them. Driver requests for CASH_CLOSE, REPORT, another Driver's Sale, or an unassigned Route return 403 without creating/exposing output. An authorized DRAFT-load request returns 409 ROUTE_LOAD_NOT_CONFIRMED. Source authorization is checked before reusing an existing canonical output and never derives from DocumentOutput.createdBy.
     */
    post: operations['requestDocument'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/documents/{documentId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: components['parameters']['DocumentId'];
      };
      cookie?: never;
    };
    /**
     * Get document
     * @description Administrators may retrieve any document metadata. Drivers may retrieve only their own Sale Tickets and confirmed route-load documents for assigned Routes, including outputs created by an Administrator. Other direct IDs return 403 without exposing metadata.
     */
    get: operations['getDocument'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/documents/{documentId}/print-data': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: components['parameters']['DocumentId'];
      };
      cookie?: never;
    };
    /**
     * Get document print data
     * @description Read-only thermal payload from immutable committed snapshots. The same source-derived authorization as metadata applies before capability checks. Returns 409 for non-ready documents or unconfirmed loads and 422 for REPORT. Does not generate output, record an attempt, or mutate the source.
     */
    get: operations['getDocumentPrintData'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/documents/{documentId}/content': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: components['parameters']['DocumentId'];
      };
      cookie?: never;
    };
    /**
     * Download document
     * @description Downloads/saves any ready TICKET, ROUTE_LOAD, CASH_CLOSE, or REPORT PDF. The browser may offer the same bytes through Web Share when supported. The same source-derived authorization as document metadata applies; output creator and possession of the document ID never broaden Driver access.
     */
    get: operations['downloadDocument'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/output-attempts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List output attempts
     * @description Administrators see all output-attempt history. Drivers see attempts only when the related document is sourced from their own Sale or from a confirmed Route Load for an assigned Route. OutputAttempt.actorId does not grant access, and TEST_PRINT attempts have no eligible business source and are therefore administrator-only. Filters and cursors only narrow the authorized scope. Results use stable keyset ordering by createdAt DESC, id DESC.
     */
    get: operations['listOutputAttempts'];
    put?: never;
    /**
     * Record output attempt
     * @description Records generation/download/share/print/test outcomes only. It never performs or retries the source business transaction. PRINT and REPRINT are valid only for TICKET, ROUTE_LOAD, and CASH_CLOSE; REPORT is portable-only. A REPORT PRINT/REPRINT request returns 422 and creates no accepted OutputAttempt. TEST_PRINT validates a printer profile without a business document. For every document mode, the API first resolves the immutable source and authorizes the actor: Drivers are limited to their own Sale Tickets and confirmed loads for assigned Routes. Forbidden source access returns 403 with no accepted attempt; capability validation follows, so Administrator REPORT printing returns 422.
     */
    post: operations['recordOutputAttempt'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/output-attempts/{outputAttemptId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        outputAttemptId: components['parameters']['OutputAttemptId'];
      };
      cookie?: never;
    };
    /**
     * Get output attempt
     * @description Uses the same source-derived authorization as the history list. A direct ID, attempt actor, output creator, or prior cursor cannot broaden Driver access; TEST_PRINT detail is administrator-only.
     */
    get: operations['getOutputAttempt'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/locations/{locationId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        locationId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update location */
    patch: operations['updateLocation'];
    trace?: never;
  };
  '/categories/{categoryId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        categoryId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update category */
    patch: operations['updateCategory'];
    trace?: never;
  };
  '/units/{unitId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        unitId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update unit */
    patch: operations['updateUnit'];
    trace?: never;
  };
  '/vehicles/{vehicleId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        vehicleId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update vehicle */
    patch: operations['updateVehicle'];
    trace?: never;
  };
  '/printer-profiles/{printerProfileId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        printerProfileId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update printer profile */
    patch: operations['updatePrinterProfile'];
    trace?: never;
  };
  '/customer-prices/{customerPriceId}/deactivation': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        customerPriceId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Deactivate customer price */
    post: operations['deactivateCustomerPrice'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/settings/business': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get business settings */
    get: operations['getBusinessSettings'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update business settings */
    patch: operations['updateBusinessSettings'];
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    ThermalDocument:
      | {
          /** Format: uuid */
          id: string;
          /** @constant */
          documentType: 'TICKET';
          sourceType: string;
          /** Format: uuid */
          sourceId: string;
          contentVersion: string;
          /** @enum {string} */
          state: 'PENDING' | 'READY' | 'FAILED';
          sourceState: string;
          snapshot: {
            ticketNumber: string;
            saleNumber: string;
            currencyCode: string;
            paymentMethod?: string;
            lines: {
              productName: string;
              unitCode: string;
              quantity: string;
              unitPrice: string;
              lineAmount: string;
            }[];
            total: string;
          };
        }
      | {
          /** Format: uuid */
          id: string;
          /** @constant */
          documentType: 'ROUTE_LOAD';
          sourceType: string;
          /** Format: uuid */
          sourceId: string;
          contentVersion: string;
          /** @enum {string} */
          state: 'PENDING' | 'READY' | 'FAILED';
          sourceState: string;
          snapshot: {
            loadNumber: string;
            routeNumber: string;
            lines: {
              productName: string;
              unitCode: string;
              quantity: string;
            }[];
          };
        }
      | {
          /** Format: uuid */
          id: string;
          /** @constant */
          documentType: 'CASH_CLOSE';
          sourceType: string;
          /** Format: uuid */
          sourceId: string;
          contentVersion: string;
          /** @enum {string} */
          state: 'PENDING' | 'READY' | 'FAILED';
          sourceState: string;
          snapshot: {
            closeNumber: string;
            currencyCode: string;
            grossTotal: string;
            partnerShare: string;
            ownerShare: string;
            expensesTotal?: string;
            netTotal?: string;
            partnerRate?: string;
            periodKind?: string;
            periodStart?: string;
            periodEnd?: string;
            businessTimezone?: string;
            correctionReason?: string | null;
            supersedesCashCloseId?: string | null;
            lines?: {
              reportingGroup: string;
              total: string;
            }[];
          };
        };
    /** Format: uuid */
    Uuid: string;
    /** @example 12.500 */
    Quantity: string;
    /**
     * @example 1
     * @example 12.500
     */
    PositiveQuantity: string;
    /** @example 1250.00 */
    Money: string;
    /** @example 1250.00 */
    NonnegativeMoney: string & components['schemas']['Money'];
    /** @example 12.3450 */
    UnitPrice: string;
    /** @enum {string} */
    UserRole: 'ADMINISTRATOR' | 'DRIVER';
    Problem: {
      /** Format: uri-reference */
      type: string;
      title: string;
      status: number;
      detail?: string;
      code: string;
      instance: string;
      fieldErrors?: {
        path: string;
        code: string;
        message: string;
      }[];
      requestId?: string;
      errors?: {
        [key: string]: string[];
      };
    };
    PageInfo: {
      hasNextPage: boolean;
      nextCursor?: string | null;
    };
    LoginRequest: {
      username: string;
      password: string;
    };
    SessionUser: {
      id: components['schemas']['Uuid'];
      username: string;
      displayName: string;
      role: components['schemas']['UserRole'];
      active: boolean;
    };
    SessionResponse: {
      data: components['schemas']['SessionUser'];
    };
    User: {
      id: components['schemas']['Uuid'];
      username: string;
      displayName: string;
      role: components['schemas']['UserRole'];
      active: boolean;
      version: number;
      /** Format: date-time */
      archivedAt?: string | null;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    UserCreateRequest: {
      username: string;
      displayName: string;
      role: components['schemas']['UserRole'];
      password: string;
    };
    UserUpdateRequest: {
      expectedVersion: number;
      displayName?: string;
      role?: components['schemas']['UserRole'];
      active?: boolean;
      password?: string;
      reason?: string;
    };
    UserResponse: {
      data: components['schemas']['User'];
    };
    UserListResponse: {
      data: components['schemas']['User'][];
      page: components['schemas']['PageInfo'];
    };
    OverviewResponse: {
      data:
        components['schemas']['AdministratorOverview'] | components['schemas']['DriverOverview'];
    };
    OverviewRoute: {
      id: components['schemas']['Uuid'];
      driverId: components['schemas']['Uuid'];
      /** @enum {string} */
      state: 'PREPARING' | 'EN_ROUTE' | 'RETURNED';
    };
    /** @description Only active routes assigned to the authenticated Driver, ordered by ID, and permitted action links. No organization-wide aggregates are queried or exposed. */
    DriverOverview: {
      routes: components['schemas']['OverviewRoute'][];
      actions: string[];
    };
    /** @description Active routes and operational aggregates read from one consistent database snapshot. */
    AdministratorOverview: {
      routes: components['schemas']['OverviewRoute'][];
      actions: string[];
      /** @description All-time sum of completed sale totals, excluding cancelled sales, as an exact decimal string. Zero is 0.00. */
      grossTotal: components['schemas']['NonnegativeMoney'];
      /** @description Number of active product and active branch pairs at or below the product threshold. A missing balance is zero. Route stock is excluded. */
      lowStockCount: number;
    };
    Location: {
      id: components['schemas']['Uuid'];
      code: string;
      name: string;
      active: boolean;
      version: number;
    };
    LocationWriteRequest: {
      code: string;
      name: string;
    };
    LocationUpdateRequest: {
      expectedVersion: number;
      code: string;
      name: string;
      active: boolean;
      reason?: string | null;
    };
    LocationResponse: {
      data: components['schemas']['Location'];
    };
    LocationListResponse: {
      data: components['schemas']['Location'][];
    };
    /** @enum {string} */
    ReportingGroup: 'SODAS' | 'CHARCOAL' | 'TOSTADAS' | 'OTHER';
    Category: {
      id: components['schemas']['Uuid'];
      name: string;
      reportingGroup: components['schemas']['ReportingGroup'];
      active: boolean;
      version: number;
    };
    CategoryWriteRequest: {
      name: string;
      reportingGroup: components['schemas']['ReportingGroup'];
    };
    CategoryUpdateRequest: {
      expectedVersion: number;
      name: string;
      reportingGroup: components['schemas']['ReportingGroup'];
      active: boolean;
      reason?: string | null;
    };
    CategoryResponse: {
      data: components['schemas']['Category'];
    };
    CategoryListResponse: {
      data: components['schemas']['Category'][];
    };
    Unit: {
      id: components['schemas']['Uuid'];
      code: string;
      name: string;
      quantityScale: number;
      active: boolean;
      version: number;
    };
    UnitWriteRequest: {
      code: string;
      name: string;
      quantityScale: number;
    };
    UnitUpdateRequest: {
      expectedVersion: number;
      code: string;
      name: string;
      quantityScale: number;
      active: boolean;
      reason?: string | null;
    };
    UnitResponse: {
      data: components['schemas']['Unit'];
    };
    UnitListResponse: {
      data: components['schemas']['Unit'][];
    };
    Product: {
      id: components['schemas']['Uuid'];
      sku: string;
      name: string;
      description?: string | null;
      categoryId: components['schemas']['Uuid'];
      unitId: components['schemas']['Uuid'];
      standardUnitPrice: components['schemas']['UnitPrice'];
      lowStockThreshold: components['schemas']['Quantity'];
      active: boolean;
      version: number;
    };
    ProductWriteRequest: {
      sku: string;
      name: string;
      description?: string | null;
      categoryId: components['schemas']['Uuid'];
      unitId: components['schemas']['Uuid'];
      standardUnitPrice: components['schemas']['UnitPrice'];
      lowStockThreshold: components['schemas']['Quantity'];
    };
    ProductUpdateRequest: {
      expectedVersion: number;
      sku: string;
      name: string;
      description?: string | null;
      categoryId: components['schemas']['Uuid'];
      unitId: components['schemas']['Uuid'];
      standardUnitPrice: components['schemas']['UnitPrice'];
      lowStockThreshold: components['schemas']['Quantity'];
      active: boolean;
      reason?: string | null;
    };
    ProductResponse: {
      data: components['schemas']['Product'];
    };
    ProductListResponse: {
      data: components['schemas']['Product'][];
      page: components['schemas']['PageInfo'];
    };
    Customer: {
      id: components['schemas']['Uuid'];
      customerNumber: string;
      displayName: string;
      contactName?: string | null;
      phone?: string | null;
      /** Format: email */
      email?: string | null;
      address?: string | null;
      city: string;
      notes?: string | null;
      active: boolean;
      version: number;
    };
    CustomerWriteRequest: {
      displayName: string;
      contactName?: string | null;
      phone?: string | null;
      /** Format: email */
      email?: string | null;
      address?: string | null;
      city: string;
      notes?: string | null;
    };
    CustomerUpdateRequest: {
      expectedVersion: number;
      displayName: string;
      contactName?: string | null;
      phone?: string | null;
      /** Format: email */
      email?: string | null;
      address?: string | null;
      city: string;
      notes?: string | null;
      active: boolean;
      reason?: string | null;
    };
    CustomerResponse: {
      data: components['schemas']['Customer'];
    };
    CustomerListResponse: {
      data: components['schemas']['Customer'][];
      page: components['schemas']['PageInfo'];
    };
    CustomerPrice: {
      id: components['schemas']['Uuid'];
      customerId: components['schemas']['Uuid'];
      productId: components['schemas']['Uuid'];
      unitPrice: components['schemas']['UnitPrice'];
      /** Format: date-time */
      validFrom: string;
      /** Format: date-time */
      validTo?: string | null;
      active: boolean;
    };
    CustomerPriceWriteRequest: {
      productId: components['schemas']['Uuid'];
      unitPrice: components['schemas']['UnitPrice'];
      /** Format: date-time */
      validFrom: string;
      /** Format: date-time */
      validTo?: string | null;
    };
    CustomerPriceResponse: {
      data: components['schemas']['CustomerPrice'];
    };
    CustomerPriceListResponse: {
      data: components['schemas']['CustomerPrice'][];
    };
    Vehicle: {
      id: components['schemas']['Uuid'];
      code: string;
      name: string;
      registration?: string | null;
      active: boolean;
      version: number;
    };
    VehicleWriteRequest: {
      code: string;
      name: string;
      registration?: string | null;
    };
    VehicleUpdateRequest: {
      expectedVersion: number;
      code: string;
      name: string;
      registration?: string | null;
      active: boolean;
      reason?: string | null;
    };
    VehicleResponse: {
      data: components['schemas']['Vehicle'];
    };
    VehicleListResponse: {
      data: components['schemas']['Vehicle'][];
    };
    PrinterProfile: {
      id: components['schemas']['Uuid'];
      name: string;
      model: string;
      /** @constant */
      transport: 'WEB_BLUETOOTH_BLE';
      serviceUuid: string;
      writeCharacteristicUuid: string;
      /** @enum {string} */
      writeMode?: 'WITH_RESPONSE' | 'WITHOUT_RESPONSE';
      commandDialect?: string;
      /** @enum {integer} */
      paperWidthMm: 58 | 80;
      encoding: string;
      maxChunkBytes: number;
      interChunkDelayMs?: number;
      active: boolean;
      version: number;
    };
    PrinterProfileWriteRequest: {
      name: string;
      model: string;
      serviceUuid: string;
      writeCharacteristicUuid: string;
      /** @enum {string} */
      writeMode: 'WITH_RESPONSE' | 'WITHOUT_RESPONSE';
      commandDialect: string;
      /** @enum {integer} */
      paperWidthMm: 58 | 80;
      encoding: string;
      maxChunkBytes: number;
      interChunkDelayMs: number;
    };
    PrinterProfileUpdateRequest: {
      expectedVersion: number;
      name: string;
      model: string;
      serviceUuid: string;
      writeCharacteristicUuid: string;
      /** @enum {string} */
      writeMode: 'WITH_RESPONSE' | 'WITHOUT_RESPONSE';
      commandDialect: string;
      /** @enum {integer} */
      paperWidthMm: 58 | 80;
      encoding: string;
      maxChunkBytes: number;
      interChunkDelayMs: number;
      active: boolean;
      reason?: string | null;
    };
    PrinterProfileResponse: {
      data: components['schemas']['PrinterProfile'];
    };
    PrinterProfileListResponse: {
      data: components['schemas']['PrinterProfile'][];
    };
    PrinterPreferenceRequest: {
      printerProfileId: components['schemas']['Uuid'];
      deviceLabel?: string | null;
      testedBrowser?: string | null;
      testedOs?: string | null;
      /** @enum {string|null} */
      lastTestResult?: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | null;
    };
    PrinterPreferenceResponse: {
      data: {
        printerProfileId: components['schemas']['Uuid'];
        deviceLabel?: string | null;
        testedBrowser?: string | null;
        testedOs?: string | null;
        /** @enum {string|null} */
        lastTestResult?: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | null;
        /** Format: date-time */
        lastTestedAt?: string | null;
      } | null;
    };
    ReasonRequest: {
      reason: string;
    };
    BusinessSetting: {
      currencyCode: string;
      /** @constant */
      currencyScale: 2;
      businessTimezone: string;
      /** @constant */
      partnerShareRate: '0.500000';
      /** @constant */
      moneyRoundingMode: 'HALF_AWAY_FROM_ZERO';
      version: number;
    };
    BusinessSettingUpdateRequest: {
      expectedVersion: number;
      currencyCode: string;
      businessTimezone: string;
      reason: string;
    };
    BusinessSettingResponse: {
      data: components['schemas']['BusinessSetting'];
    };
    /** @enum {string} */
    InventoryOperationType:
      | 'ENTRY'
      | 'MANUAL_EXIT'
      | 'TRANSFER'
      | 'ROUTE_LOAD'
      | 'SALE'
      | 'ROUTE_RETURN'
      | 'POSITIVE_ADJUSTMENT'
      | 'NEGATIVE_ADJUSTMENT'
      | 'SALE_CANCELLATION';
    StockLocationRef: {
      id: components['schemas']['Uuid'];
      /** @enum {string} */
      kind: 'BRANCH' | 'ROUTE';
      label: string;
      /** Format: uuid */
      branchId?: string | null;
      /** Format: uuid */
      routeId?: string | null;
    };
    InventoryBalance: {
      id: components['schemas']['Uuid'];
      productId: components['schemas']['Uuid'];
      productName?: string;
      stockLocation: components['schemas']['StockLocationRef'];
      quantity: components['schemas']['Quantity'];
      lowStockAlert: boolean;
      version: number;
      /** Format: date-time */
      updatedAt: string;
    };
    InventoryBalanceListResponse: {
      data: components['schemas']['InventoryBalance'][];
      page: components['schemas']['PageInfo'];
    };
    InventoryMovement: {
      id: components['schemas']['Uuid'];
      operationId: components['schemas']['Uuid'];
      operationType: components['schemas']['InventoryOperationType'];
      productId: components['schemas']['Uuid'];
      source?: components['schemas']['StockLocationRef'] | null;
      destination?: components['schemas']['StockLocationRef'] | null;
      quantity: components['schemas']['PositiveQuantity'];
      sourceBalanceAfter?: components['schemas']['Quantity'] | null;
      destinationBalanceAfter?: components['schemas']['Quantity'] | null;
      actorId: components['schemas']['Uuid'];
      reason?: string | null;
      /** Format: date-time */
      occurredAt: string;
      relatedEntityType: string;
      relatedEntityId: components['schemas']['Uuid'];
      reversesMovementId: components['schemas']['Uuid'] | null;
    };
    InventoryMovementListResponse: {
      data: components['schemas']['InventoryMovement'][];
      page: components['schemas']['PageInfo'];
    };
    InventoryOperationLineRequest: {
      productId: components['schemas']['Uuid'];
      quantity: components['schemas']['PositiveQuantity'];
    };
    InventoryOperationRequest: {
      /** @enum {string} */
      operationType: 'ENTRY' | 'MANUAL_EXIT' | 'POSITIVE_ADJUSTMENT' | 'NEGATIVE_ADJUSTMENT';
      branchId: components['schemas']['Uuid'];
      reason: string;
      lines: components['schemas']['InventoryOperationLineRequest'][];
    };
    InventoryTransferRequest: {
      sourceBranchId: components['schemas']['Uuid'];
      destinationBranchId: components['schemas']['Uuid'];
      reason: string;
      lines: components['schemas']['InventoryOperationLineRequest'][];
    };
    InventoryOperation: {
      id: components['schemas']['Uuid'];
      operationType: components['schemas']['InventoryOperationType'];
      actorId: components['schemas']['Uuid'];
      reason: string | null;
      movements: components['schemas']['InventoryMovement'][];
      /** Format: date-time */
      occurredAt: string;
    };
    InventoryOperationResponse: {
      data: components['schemas']['InventoryOperation'];
    };
    ExpectedVersionRequest: {
      expectedVersion: number;
    };
    /** @enum {string} */
    RouteState: 'PREPARING' | 'EN_ROUTE' | 'RETURNED' | 'CLOSED';
    RouteCreateRequest: {
      originLocationId: components['schemas']['Uuid'];
      driverId: components['schemas']['Uuid'];
      vehicleId: components['schemas']['Uuid'];
      /** Format: date */
      businessDate: string;
      routeNumber?: string;
    };
    Route: {
      id: components['schemas']['Uuid'];
      routeNumber: string;
      state: components['schemas']['RouteState'];
      originLocationId: components['schemas']['Uuid'];
      driverId: components['schemas']['Uuid'];
      vehicleId: components['schemas']['Uuid'];
      /** Format: date */
      businessDate: string;
      createdBy: components['schemas']['Uuid'];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      startedAt?: string | null;
      /** Format: date-time */
      returnedAt?: string | null;
      /** Format: date-time */
      closedAt?: string | null;
      /** Format: uuid */
      closedBy?: string | null;
      version: number;
    };
    RouteResponse: {
      data: components['schemas']['Route'];
    };
    RouteListResponse: {
      data: components['schemas']['Route'][];
      page: components['schemas']['PageInfo'];
    };
    RouteLoadLineRequest: {
      productId: components['schemas']['Uuid'];
      quantity: components['schemas']['PositiveQuantity'];
    };
    RouteLoadDraftRequest: {
      expectedVersion: number;
      lines: components['schemas']['RouteLoadLineRequest'][];
    };
    RouteLoad: {
      id: components['schemas']['Uuid'];
      routeId: components['schemas']['Uuid'];
      /** @enum {string} */
      state: 'DRAFT' | 'CONFIRMED';
      recordedBy: components['schemas']['Uuid'];
      /** Format: date-time */
      confirmedAt?: string | null;
      lines: {
        productId: components['schemas']['Uuid'];
        quantity: components['schemas']['PositiveQuantity'];
      }[];
      version: number;
    };
    RouteLoadResponse: {
      data: components['schemas']['RouteLoad'];
    };
    RouteReconciliationLineRequest: {
      productId: components['schemas']['Uuid'];
      physicalReturnQuantity: components['schemas']['Quantity'];
      differenceReason?: string | null;
    };
    RouteReconciliationRequest: {
      expectedVersion: number;
      lines: components['schemas']['RouteReconciliationLineRequest'][];
    };
    RouteReconciliationLine: {
      productId: components['schemas']['Uuid'];
      loadedQuantity: components['schemas']['Quantity'];
      soldQuantity: components['schemas']['Quantity'];
      expectedReturnQuantity: components['schemas']['Quantity'];
      physicalReturnQuantity: components['schemas']['Quantity'];
      differenceQuantity: string;
      differenceReason?: string | null;
    };
    RouteReconciliation: {
      id: components['schemas']['Uuid'];
      routeId: components['schemas']['Uuid'];
      /** @constant */
      state: 'APPROVED';
      recordedBy: components['schemas']['Uuid'];
      approvedBy: components['schemas']['Uuid'];
      /** Format: date-time */
      approvedAt: string;
      lines: components['schemas']['RouteReconciliationLine'][];
      version: number;
    };
    RouteReconciliationResponse: {
      data: components['schemas']['RouteReconciliation'];
    };
    RouteDetail: {
      route: components['schemas']['Route'];
      load?: components['schemas']['RouteLoad'] | null;
      balances: components['schemas']['InventoryBalance'][];
      /** @description Role-scoped immutable movement history for this route. */
      movements: components['schemas']['InventoryMovement'][];
      sales: components['schemas']['SaleSummary'][];
      reconciliation?: components['schemas']['RouteReconciliation'] | null;
    };
    RouteDetailResponse: {
      data: components['schemas']['RouteDetail'];
    };
    /** @enum {string} */
    PaymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD';
    /** @enum {string} */
    SaleStatus: 'COMPLETED' | 'CANCELLED';
    SaleCreateLineRequest: {
      productId: components['schemas']['Uuid'];
      quantity: components['schemas']['PositiveQuantity'];
    };
    SaleQuoteRequest: {
      customerId: components['schemas']['Uuid'];
      routeId: components['schemas']['Uuid'];
      lines: components['schemas']['SaleCreateLineRequest'][];
    };
    SaleQuoteLine: {
      productId: components['schemas']['Uuid'];
      requestedQuantity: components['schemas']['PositiveQuantity'];
      availableQuantity: components['schemas']['Quantity'];
      available: boolean;
      /** @enum {string} */
      appliedPriceSource: 'CUSTOMER' | 'STANDARD';
      unitPrice: components['schemas']['UnitPrice'];
      lineAmount: components['schemas']['NonnegativeMoney'];
      quantity?: components['schemas']['PositiveQuantity'];
      productName?: string;
      categoryName?: string;
      /** @enum {string} */
      reportingGroup?: 'SODAS' | 'CHARCOAL' | 'TOSTADAS' | 'OTHER';
      unitCode?: string;
      customerPriceId?: components['schemas']['Uuid'] | null;
    };
    SaleQuoteResponse: {
      data: {
        customerId: components['schemas']['Uuid'];
        routeId: components['schemas']['Uuid'];
        currencyCode: string;
        lines: components['schemas']['SaleQuoteLine'][];
        total: components['schemas']['NonnegativeMoney'];
        /** Format: date-time */
        quotedAt: string;
      };
    };
    SaleCreateRequest: {
      clientOperationId: components['schemas']['Uuid'];
      customerId: components['schemas']['Uuid'];
      routeId: components['schemas']['Uuid'];
      paymentMethod: components['schemas']['PaymentMethod'];
      lines: components['schemas']['SaleCreateLineRequest'][];
    };
    SaleLine: {
      sequence: number;
      productId: components['schemas']['Uuid'];
      productName: string;
      categoryName: string;
      reportingGroup: components['schemas']['ReportingGroup'];
      unitCode: string;
      quantity: components['schemas']['PositiveQuantity'];
      /** @enum {string} */
      appliedPriceSource: 'CUSTOMER' | 'STANDARD';
      unitPrice: components['schemas']['UnitPrice'];
      lineAmount: components['schemas']['NonnegativeMoney'];
    };
    SaleSummary: {
      id: components['schemas']['Uuid'];
      saleNumber: string;
      status: components['schemas']['SaleStatus'];
      customerId: components['schemas']['Uuid'];
      driverId: components['schemas']['Uuid'];
      routeId: components['schemas']['Uuid'];
      paymentMethod: components['schemas']['PaymentMethod'];
      total: components['schemas']['NonnegativeMoney'];
      /** Format: date-time */
      completedAt: string;
      /** Format: date-time */
      cancelledAt?: string | null;
    };
    Sale: {
      id: components['schemas']['Uuid'];
      saleNumber: string;
      clientOperationId: components['schemas']['Uuid'];
      status: components['schemas']['SaleStatus'];
      customerId: components['schemas']['Uuid'];
      driverId: components['schemas']['Uuid'];
      routeId: components['schemas']['Uuid'];
      originLocationId: components['schemas']['Uuid'];
      paymentMethod: components['schemas']['PaymentMethod'];
      currencyCode: string;
      subtotal: components['schemas']['NonnegativeMoney'];
      total: components['schemas']['NonnegativeMoney'];
      /** @constant */
      roundingMode: 'HALF_AWAY_FROM_ZERO';
      lines: components['schemas']['SaleLine'][];
      ticketNumber: string;
      /** Format: date-time */
      completedAt: string;
      /** Format: date-time */
      cancelledAt?: string | null;
      /** Format: uuid */
      cancelledBy?: string | null;
      cancellationReason?: string | null;
    };
    SaleResponse: {
      data: components['schemas']['Sale'];
    };
    SaleListResponse: {
      data: components['schemas']['SaleSummary'][];
      page: components['schemas']['PageInfo'];
    };
    SaleCancellationRequest: {
      reason: string;
    };
    CashCloseCreateRequest: {
      /** @enum {string} */
      periodKind: 'DAY' | 'WEEK' | 'MONTH';
      /** Format: date */
      anchorDate: string;
    };
    CashCloseCorrectionRequest: {
      reason: string;
    };
    CashCloseLine: {
      reportingGroup: components['schemas']['ReportingGroup'];
      total: components['schemas']['NonnegativeMoney'];
    };
    CashClose: {
      id: components['schemas']['Uuid'];
      closeNumber: string;
      /** @enum {string} */
      periodKind: 'DAY' | 'WEEK' | 'MONTH';
      /** Format: date */
      anchorDate: string;
      /** Format: date-time */
      periodStart: string;
      /** Format: date-time */
      periodEnd: string;
      businessTimezone: string;
      /** @enum {string} */
      status: 'CURRENT' | 'SUPERSEDED';
      /** Format: uuid */
      supersedesCashCloseId: string | null;
      /** Format: uuid */
      supersededByCashCloseId: string | null;
      correctionReason: string | null;
      currencyCode: string;
      grossTotal: components['schemas']['NonnegativeMoney'];
      partnerRate: string;
      partnerAmount: components['schemas']['NonnegativeMoney'];
      remainingAmount: components['schemas']['NonnegativeMoney'];
      /** @constant */
      roundingMode: 'HALF_AWAY_FROM_ZERO';
      lines: components['schemas']['CashCloseLine'][];
      contributingSaleIds: components['schemas']['Uuid'][];
      createdBy: components['schemas']['Uuid'];
      /** Format: date-time */
      createdAt: string;
    };
    CashCloseResponse: {
      data: components['schemas']['CashClose'];
    };
    CashCloseListResponse: {
      data: components['schemas']['CashClose'][];
      page: components['schemas']['PageInfo'];
    };
    ReportResponse: {
      data: {
        /** @enum {string} */
        reportType:
          'SALES_BY_DRIVER' | 'BEST_SELLING_PRODUCTS' | 'INVENTORY_BY_BRANCH' | 'FINANCIAL_SUMMARY';
        /** Format: date-time */
        generatedAt: string;
        businessTimezone: string;
        filters: {
          [key: string]: unknown;
        };
        rows: {
          [key: string]: unknown;
        }[];
        totals?: {
          [key: string]: unknown;
        };
      };
    };
    ReportSnapshotCreateRequest: {
      /** @enum {string} */
      reportType:
        'SALES_BY_DRIVER' | 'BEST_SELLING_PRODUCTS' | 'INVENTORY_BY_BRANCH' | 'FINANCIAL_SUMMARY';
      filters: {
        [key: string]: unknown;
      };
    };
    ReportSnapshot: {
      id: components['schemas']['Uuid'];
      /** @enum {string} */
      reportType:
        'SALES_BY_DRIVER' | 'BEST_SELLING_PRODUCTS' | 'INVENTORY_BY_BRANCH' | 'FINANCIAL_SUMMARY';
      filters: {
        [key: string]: unknown;
      };
      businessTimezone: string;
      sourceWatermark: string;
      result: {
        [key: string]: unknown;
      };
      createdBy: components['schemas']['Uuid'];
      /** Format: date-time */
      createdAt: string;
    };
    ReportSnapshotResponse: {
      data: components['schemas']['ReportSnapshot'];
    };
    /**
     * @description TICKET is the sole customer-facing Sale Ticket document type. All values are portable PDF types; only TICKET, ROUTE_LOAD, and CASH_CLOSE are thermal-printable.
     * @enum {string}
     */
    DocumentType: 'TICKET' | 'ROUTE_LOAD' | 'CASH_CLOSE' | 'REPORT';
    DocumentCreateRequest:
      | {
          /** @constant */
          documentType: 'TICKET';
          /** @constant */
          sourceType: 'SALE';
          sourceId: components['schemas']['Uuid'];
        }
      | {
          /** @constant */
          documentType: 'ROUTE_LOAD';
          /** @constant */
          sourceType: 'ROUTE_LOAD';
          sourceId: components['schemas']['Uuid'];
        }
      | {
          /** @constant */
          documentType: 'CASH_CLOSE';
          /** @constant */
          sourceType: 'CASH_CLOSE';
          sourceId: components['schemas']['Uuid'];
        }
      | {
          /** @constant */
          documentType: 'REPORT';
          /** @constant */
          sourceType: 'REPORT_SNAPSHOT';
          sourceId: components['schemas']['Uuid'];
        };
    DocumentOutput: {
      id: components['schemas']['Uuid'];
      documentType: components['schemas']['DocumentType'];
      sourceType: string;
      sourceId: components['schemas']['Uuid'];
      contentVersion: string;
      contentHash?: string | null;
      /** @enum {string} */
      state: 'PENDING' | 'READY' | 'FAILED';
      createdBy: components['schemas']['Uuid'];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      readyAt?: string | null;
      lastErrorCode?: string | null;
    };
    DocumentResponse: {
      data: components['schemas']['DocumentOutput'];
    };
    DocumentListResponse: {
      data: components['schemas']['DocumentOutput'][];
      page: components['schemas']['PageInfo'];
    };
    /** @description PRINT/REPRINT require a printer and a TICKET, ROUTE_LOAD, or CASH_CLOSE document. REPORT print/reprint is rejected with 422. TEST_PRINT has a printer but no document. Cross-resource document-type validation is authoritative in the API and database. */
    OutputAttemptRequest:
      | {
          /** Format: uuid */
          documentId: string;
          /** @enum {string} */
          mode: 'GENERATE' | 'DOWNLOAD' | 'SHARE';
          /** @enum {string} */
          state: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
          errorCode?: string | null;
          requestId?: string | null;
        }
      | {
          /** Format: uuid */
          documentId: string;
          /** @enum {string} */
          mode: 'PRINT' | 'REPRINT';
          /** Format: uuid */
          printerProfileId: string;
          /** @enum {string} */
          state: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
          errorCode?: string | null;
          requestId?: string | null;
        }
      | {
          /** @constant */
          mode: 'TEST_PRINT';
          /** Format: uuid */
          printerProfileId: string;
          /** @enum {string} */
          state: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
          errorCode?: string | null;
          requestId?: string | null;
        };
    OutputAttempt: {
      id: components['schemas']['Uuid'];
      actorId: components['schemas']['Uuid'];
      /** Format: uuid */
      documentId?: string | null;
      /** @enum {string} */
      mode: 'GENERATE' | 'DOWNLOAD' | 'SHARE' | 'PRINT' | 'REPRINT' | 'TEST_PRINT';
      /** Format: uuid */
      printerProfileId?: string | null;
      /** @enum {string} */
      state: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
      errorCode?: string | null;
      requestId?: string | null;
      attemptNumber: number;
      /** Format: date-time */
      createdAt: string;
    };
    OutputAttemptResponse: {
      data: components['schemas']['OutputAttempt'];
    };
    OutputAttemptListResponse: {
      data: components['schemas']['OutputAttempt'][];
      page: components['schemas']['PageInfo'];
    };
  };
  responses: {
    /** @description RFC 9457 error; exact status and stable code identify the failure */
    Problem: {
      headers: {
        'X-Request-Id'?: string;
        [name: string]: unknown;
      };
      content: {
        'application/problem+json': components['schemas']['Problem'];
      };
    };
  };
  parameters: {
    /** @description Per-session synchronizer token for an authenticated unsafe request */
    CsrfToken: string;
    /** @description Unique key scoped to actor and operation; reuse requires identical content */
    IdempotencyKey: string;
    Cursor: string;
    Limit: number;
    Search: string;
    UserId: components['schemas']['Uuid'];
    ProductId: components['schemas']['Uuid'];
    CustomerId: components['schemas']['Uuid'];
    RouteId: components['schemas']['Uuid'];
    SaleId: components['schemas']['Uuid'];
    CashCloseId: components['schemas']['Uuid'];
    DocumentId: components['schemas']['Uuid'];
    OutputAttemptId: components['schemas']['Uuid'];
    /** @description Calendar period interpreted in the configured business timezone */
    PeriodKind: 'DAY' | 'WEEK' | 'MONTH';
    /** @description Local calendar date contained in the requested reporting period */
    AnchorDate: string;
    /** @description Optional inclusive UTC instant for history filtering */
    HistoryFrom: string;
    /** @description Optional exclusive UTC instant for history filtering */
    HistoryTo: string;
  };
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Process is ready to serve requests */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @constant */
            status: 'ok';
          };
        };
      };
      400: components['responses']['Problem'];
      500: components['responses']['Problem'];
      503: components['responses']['Problem'];
    };
  };
  login: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LoginRequest'];
      };
    };
    responses: {
      /** @description Authenticated session; sets the secure session cookie */
      200: {
        headers: {
          /** @description Synchronizer token for subsequent unsafe requests */
          'X-CSRF-Token'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SessionResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getSession: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Current authenticated session */
      200: {
        headers: {
          /** @description Current synchronizer token */
          'X-CSRF-Token'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SessionResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  logout: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Session revoked and cookie cleared */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getRoleOverview: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Role-filtered operational overview */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OverviewResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listUsers: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        search?: components['parameters']['Search'];
        active?: boolean;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Users visible to an administrator */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createUser: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UserCreateRequest'];
      };
    };
    responses: {
      /** @description User created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getUser: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: components['parameters']['UserId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description User detail */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updateUser: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        userId: components['parameters']['UserId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UserUpdateRequest'];
      };
    };
    responses: {
      /** @description User updated, activated, or deactivated */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listLocations: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Stock-holding branches */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LocationListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createLocation: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LocationWriteRequest'];
      };
    };
    responses: {
      /** @description Location created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LocationResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listCategories: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Product categories */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CategoryListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createCategory: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CategoryWriteRequest'];
      };
    };
    responses: {
      /** @description Category created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CategoryResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listUnits: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Product units */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UnitListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createUnit: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UnitWriteRequest'];
      };
    };
    responses: {
      /** @description Unit created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UnitResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listProducts: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        search?: components['parameters']['Search'];
        active?: boolean;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Products visible to the caller */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createProduct: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProductWriteRequest'];
      };
    };
    responses: {
      /** @description Product created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getProduct: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        productId: components['parameters']['ProductId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Product detail */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updateProduct: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        productId: components['parameters']['ProductId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProductUpdateRequest'];
      };
    };
    responses: {
      /** @description Product updated, activated, or archived */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listCustomers: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        search?: components['parameters']['Search'];
        active?: boolean;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Customers with fields filtered by caller role */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createCustomer: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CustomerWriteRequest'];
      };
    };
    responses: {
      /** @description Customer created by an administrator */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getCustomer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        customerId: components['parameters']['CustomerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Customer detail filtered by role */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updateCustomer: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        customerId: components['parameters']['CustomerId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CustomerUpdateRequest'];
      };
    };
    responses: {
      /** @description Customer updated, activated, or archived */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listCustomerPrices: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        customerId: components['parameters']['CustomerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Customer-specific product price history */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerPriceListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createCustomerPrice: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        customerId: components['parameters']['CustomerId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CustomerPriceWriteRequest'];
      };
    };
    responses: {
      /** @description Customer-specific price created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerPriceResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listCustomerSales: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
      };
      header?: never;
      path: {
        customerId: components['parameters']['CustomerId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Customer purchase history; administrators only */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SaleListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listVehicles: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Delivery vehicles */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VehicleListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createVehicle: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['VehicleWriteRequest'];
      };
    };
    responses: {
      /** @description Vehicle created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VehicleResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listPrinterProfiles: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Approved printer profiles available to the caller */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PrinterProfileListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createPrinterProfile: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PrinterProfileWriteRequest'];
      };
    };
    responses: {
      /** @description Approved printer profile created by an administrator */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PrinterProfileResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getMyPrinterPreference: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Current user's limited printer preference */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PrinterPreferenceResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  setMyPrinterPreference: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PrinterPreferenceRequest'];
      };
    };
    responses: {
      /** @description Preference saved; physical permission remains browser-local */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PrinterPreferenceResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listInventoryBalances: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        productId?: components['schemas']['Uuid'];
        branchId?: components['schemas']['Uuid'];
        routeId?: components['schemas']['Uuid'];
        alertsOnly?: boolean;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Role-filtered current balances */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InventoryBalanceListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listInventoryMovements: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        productId?: components['schemas']['Uuid'];
        branchId?: components['schemas']['Uuid'];
        routeId?: components['schemas']['Uuid'];
        operationType?: components['schemas']['InventoryOperationType'];
        from?: string;
        to?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Role-scoped traceable inventory movements */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InventoryMovementListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createInventoryOperation: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['InventoryOperationRequest'];
      };
    };
    responses: {
      /** @description Operation and all movements committed atomically */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InventoryOperationResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createInventoryTransfer: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['InventoryTransferRequest'];
      };
    };
    responses: {
      /** @description Full transfer committed or no changes made */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InventoryOperationResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  reverseInventoryOperation: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path: {
        operationId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReasonRequest'];
      };
    };
    responses: {
      /** @description Compensating operation committed atomically */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InventoryOperationResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listRoutes: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        state?: components['schemas']['RouteState'];
        /** @description Administrator filter; Drivers may specify only their own identity. */
        driverId?: components['schemas']['Uuid'];
        businessDate?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Routes visible under the caller's role and resource scope */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createRoute: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RouteCreateRequest'];
      };
    };
    responses: {
      /** @description Preparing route created and assigned by an administrator */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getRoute: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Route with load, balances, movements, sales, return, reconciliation, and closure history */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteDetailResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  replaceRouteLoadDraft: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RouteLoadDraftRequest'];
      };
    };
    responses: {
      /** @description Draft load replaced */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteLoadResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  confirmRouteLoad: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExpectedVersionRequest'];
      };
    };
    responses: {
      /** @description Full load moved from branch to temporary route inventory */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteDetailResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  startRoute: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExpectedVersionRequest'];
      };
    };
    responses: {
      /** @description Assigned driver moved route from Preparing to En Route */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  returnRoute: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExpectedVersionRequest'];
      };
    };
    responses: {
      /** @description Assigned driver moved route from En Route to Returned */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  approveRouteReconciliation: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RouteReconciliationRequest'];
      };
    };
    responses: {
      /** @description Reconciliation approved and temporary route inventory is zero */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteReconciliationResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  closeRoute: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path: {
        routeId: components['parameters']['RouteId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExpectedVersionRequest'];
      };
    };
    responses: {
      /** @description Fully reconciled route closed by an administrator */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RouteResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listSales: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        customerId?: components['schemas']['Uuid'];
        /** @description Administrator filter; Drivers may specify only their own identity. */
        driverId?: components['schemas']['Uuid'];
        routeId?: components['schemas']['Uuid'];
        from?: string;
        to?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Sales visible under the caller's role and resource scope */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SaleListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  confirmSale: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SaleCreateRequest'];
      };
    };
    responses: {
      /** @description Sale confirmed exactly once */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SaleResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  quoteSale: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SaleQuoteRequest'];
      };
    };
    responses: {
      /** @description Current authoritative preview for the assigned driver's route */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SaleQuoteResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getSale: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        saleId: components['parameters']['SaleId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Preserved sale and sale-ticket detail */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SaleResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  cancelSale: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path: {
        saleId: components['parameters']['SaleId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SaleCancellationRequest'];
      };
    };
    responses: {
      /** @description Administrator cancellation preserved original sale and restored stock once */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SaleResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listCashCloses: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        periodKind?: 'DAY' | 'WEEK' | 'MONTH';
        anchorDate?: string;
        status?: 'CURRENT' | 'SUPERSEDED';
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Saved cash closes; administrators only */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CashCloseListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createCashClose: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CashCloseCreateRequest'];
      };
    };
    responses: {
      /** @description Reproducible cash close created from completed sales */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CashCloseResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      /** @description CASH_CLOSE_PERIOD_ALREADY_CURRENT when a different request attempts to create another current close for the exact resolved period, or IDEMPOTENCY_KEY_REUSED when a key is reused with different content. */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': components['schemas']['Problem'];
        };
      };
      /** @description INVALID_REPORTING_PERIOD or another validation failure */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': components['schemas']['Problem'];
        };
      };
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getCashClose: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        cashCloseId: components['parameters']['CashCloseId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Preserved cash-close detail and contributing sales */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CashCloseResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  correctCashClose: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path: {
        cashCloseId: components['parameters']['CashCloseId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CashCloseCorrectionRequest'];
      };
    };
    responses: {
      /** @description Immutable successor created and made current */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CashCloseResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      /** @description CASH_CLOSE_NOT_CURRENT, IDEMPOTENCY_KEY_REUSED, or a concurrent correction conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': components['schemas']['Problem'];
        };
      };
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getSalesByDriverReport: {
    parameters: {
      query: {
        /** @description Calendar period interpreted in the configured business timezone */
        periodKind: components['parameters']['PeriodKind'];
        /** @description Local calendar date contained in the requested reporting period */
        anchorDate: components['parameters']['AnchorDate'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Exact sales totals grouped by driver */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReportResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      /** @description INVALID_REPORTING_PERIOD or another validation failure */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': components['schemas']['Problem'];
        };
      };
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getBestSellingProductsReport: {
    parameters: {
      query: {
        /** @description Calendar period interpreted in the configured business timezone */
        periodKind: components['parameters']['PeriodKind'];
        /** @description Local calendar date contained in the requested reporting period */
        anchorDate: components['parameters']['AnchorDate'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Products ranked by sold quantity and exact amount */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReportResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      /** @description INVALID_REPORTING_PERIOD or another validation failure */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': components['schemas']['Problem'];
        };
      };
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getInventoryByBranchReport: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Current inventory grouped by fixed branch */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReportResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getFinancialSummaryReport: {
    parameters: {
      query: {
        /** @description Calendar period interpreted in the configured business timezone */
        periodKind: components['parameters']['PeriodKind'];
        /** @description Local calendar date contained in the requested reporting period */
        anchorDate: components['parameters']['AnchorDate'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Gross sales, partner share, and remaining share */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReportResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      /** @description INVALID_REPORTING_PERIOD or another validation failure */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/problem+json': components['schemas']['Problem'];
        };
      };
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  createReportSnapshot: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReportSnapshotCreateRequest'];
      };
    };
    responses: {
      /** @description Exact report snapshot created from the validated filters */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReportSnapshotResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listDocuments: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        documentType?: components['schemas']['DocumentType'];
        state?: 'PENDING' | 'READY' | 'FAILED';
        sourceType?: 'SALE' | 'ROUTE_LOAD' | 'CASH_CLOSE' | 'REPORT_SNAPSHOT';
        sourceId?: components['schemas']['Uuid'];
        /** @description Optional inclusive UTC instant for history filtering */
        from?: components['parameters']['HistoryFrom'];
        /** @description Optional exclusive UTC instant for history filtering */
        to?: components['parameters']['HistoryTo'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Source-authorized document history page */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  requestDocument: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DocumentCreateRequest'];
      };
    };
    responses: {
      /** @description Document generation accepted or existing output returned */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getDocument: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: components['parameters']['DocumentId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Document generation status and source metadata */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DocumentResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getDocumentPrintData: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: components['parameters']['DocumentId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Authorized printable snapshot; private, no-store */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            data: components['schemas']['ThermalDocument'];
          };
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  downloadDocument: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        documentId: components['parameters']['DocumentId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Ready canonical PDF */
      200: {
        headers: {
          'Content-Disposition'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/pdf': string;
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  listOutputAttempts: {
    parameters: {
      query?: {
        cursor?: components['parameters']['Cursor'];
        limit?: components['parameters']['Limit'];
        documentId?: components['schemas']['Uuid'];
        mode?: 'GENERATE' | 'DOWNLOAD' | 'SHARE' | 'PRINT' | 'REPRINT' | 'TEST_PRINT';
        state?: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
        /** @description Optional inclusive UTC instant for history filtering */
        from?: components['parameters']['HistoryFrom'];
        /** @description Optional exclusive UTC instant for history filtering */
        to?: components['parameters']['HistoryTo'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Source-authorized output-attempt history page */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OutputAttemptListResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  recordOutputAttempt: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
        /** @description Unique key scoped to actor and operation; reuse requires identical content */
        'Idempotency-Key': components['parameters']['IdempotencyKey'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['OutputAttemptRequest'];
      };
    };
    responses: {
      /** @description Output attempt recorded */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OutputAttemptResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getOutputAttempt: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        outputAttemptId: components['parameters']['OutputAttemptId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Authorized output-attempt detail */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OutputAttemptResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updateLocation: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        locationId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LocationUpdateRequest'];
      };
    };
    responses: {
      /** @description Location updated or deactivated without deleting history */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LocationResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updateCategory: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        categoryId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CategoryUpdateRequest'];
      };
    };
    responses: {
      /** @description Category updated or deactivated without rewriting sale snapshots */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CategoryResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updateUnit: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        unitId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UnitUpdateRequest'];
      };
    };
    responses: {
      /** @description Unit updated or deactivated without deleting history */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UnitResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updateVehicle: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        vehicleId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['VehicleUpdateRequest'];
      };
    };
    responses: {
      /** @description Vehicle updated or deactivated when it has no active route */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VehicleResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updatePrinterProfile: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        printerProfileId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PrinterProfileUpdateRequest'];
      };
    };
    responses: {
      /** @description Supported printer profile updated or deactivated */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PrinterProfileResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  deactivateCustomerPrice: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path: {
        customerPriceId: components['schemas']['Uuid'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReasonRequest'];
      };
    };
    responses: {
      /** @description Customer price deactivated; completed sales remain unchanged */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerPriceResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  getBusinessSettings: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Business currency, timezone, partner rate, and rounding settings */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BusinessSettingResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
  updateBusinessSettings: {
    parameters: {
      query?: never;
      header: {
        /** @description Per-session synchronizer token for an authenticated unsafe request */
        'X-CSRF-Token': components['parameters']['CsrfToken'];
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['BusinessSettingUpdateRequest'];
      };
    };
    responses: {
      /** @description Settings updated for future operations; history remains unchanged */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BusinessSettingResponse'];
        };
      };
      400: components['responses']['Problem'];
      401: components['responses']['Problem'];
      403: components['responses']['Problem'];
      404: components['responses']['Problem'];
      409: components['responses']['Problem'];
      422: components['responses']['Problem'];
      429: components['responses']['Problem'];
      500: components['responses']['Problem'];
    };
  };
}

export type ApiPaths = paths;
export type UserRole = components['schemas']['UserRole'];
export type SessionUser = components['schemas']['SessionUser'];
export type SessionResponse = components['schemas']['SessionResponse'];
export type ProblemDetails = components['schemas']['Problem'];

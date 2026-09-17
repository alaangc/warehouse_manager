import express, { type Express } from 'express';
import type { DestinationStream } from 'pino';
import type { Environment } from './config/env.js';
import { createDatabase, type AppDatabase } from './db/database.js';
import { AuthService, type AuthenticationGateway } from './auth/auth-service.js';
import {
  createAuthRouter,
  csrfProtection,
  originProtection,
  sessionMiddleware,
} from './auth/auth-routes.js';
import { createHealthRouter } from './http/health-routes.js';
import { createHttpLogger } from './http/logger.js';
import { notFoundHandler, problemHandler } from './http/problem-handler.js';
import { requestContext } from './http/request-context.js';
import { configureSecurity } from './http/security.js';
import { createInventoryRouter } from './modules/inventory/inventory-routes.js';
import { createCatalogRouter } from './modules/catalog/catalog-routes.js';
import { createSalesRouter } from './modules/sales/sales-routes.js';
import { createCustomerRouter } from './modules/customers/customer-routes.js';
import { createRouteRouter } from './modules/routes/route-routes.js';
import { createReportRouter } from './modules/reports/report-routes.js';
import { createAdministrationRouter } from './modules/users/administration-routes.js';
import { createOverviewRouter } from './modules/overview/overview-routes.js';
import { createDocumentRouter } from './modules/documents/document-routes.js';
import { operationContext } from './observability/operations.js';

export type ServerOptions = {
  database?: AppDatabase;
  auth?: AuthenticationGateway;
  logDestination?: DestinationStream;
};

export function createServer(environment: Environment, options: ServerOptions = {}): Express {
  const database = options.database ?? createDatabase(environment.DATABASE_URL);
  const auth = options.auth ?? new AuthService(database);
  const app = express();
  app.use(requestContext, createHttpLogger(environment, options.logDestination), operationContext);
  configureSecurity(app, environment);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', createHealthRouter(database));
  app.use(
    '/api/v1',
    originProtection(environment.APP_ORIGIN),
    sessionMiddleware(auth, environment),
    csrfProtection(auth),
  );
  app.use('/api/v1', createAuthRouter(auth, environment));
  app.use('/api/v1', createCatalogRouter(database));
  app.use('/api/v1', createCustomerRouter(database));
  app.use('/api/v1', createRouteRouter(database));
  app.use('/api/v1', createInventoryRouter(database));
  app.use('/api/v1', createSalesRouter(database));
  app.use('/api/v1', createReportRouter(database));
  app.use('/api/v1', createAdministrationRouter(database));
  app.use('/api/v1', createOverviewRouter(database));
  app.use('/api/v1', createDocumentRouter(database, environment));
  app.use(notFoundHandler, problemHandler);
  return app;
}

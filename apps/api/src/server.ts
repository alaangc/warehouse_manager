import express, { type Express } from 'express';
import path from 'node:path';
import helmet from 'helmet';
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
import { createInventoryRouter } from './modules/inventory/inventory-routes.js';
import { createCatalogRouter } from './modules/catalog/catalog-routes.js';
import { createSalesRouter } from './modules/sales/sales-routes.js';
import { createCustomerRouter } from './modules/customers/customer-routes.js';
import { createRouteRouter } from './modules/routes/route-routes.js';
import { createReportRouter } from './modules/reports/report-routes.js';
import { createAdministrationRouter } from './modules/users/administration-routes.js';
import { createOverviewRouter } from './modules/overview/overview-routes.js';

export type ServerOptions = {
  database?: AppDatabase;
  auth?: AuthenticationGateway;
  webDirectory?: string;
};

export function createServer(environment: Environment, options: ServerOptions = {}): Express {
  const database = options.database ?? createDatabase(environment.DATABASE_URL);
  const auth = options.auth ?? new AuthService(database);
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext, createHttpLogger(environment), helmet(), express.json({ limit: '1mb' }));
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
  if (options.webDirectory) {
    const directory = path.resolve(options.webDirectory);
    app.use('/api', notFoundHandler);
    app.use(express.static(directory));
    app.get('/{*path}', (request, response, next) => {
      if (path.extname(request.path) || !request.accepts('html')) return next();
      response.set('Cache-Control', 'no-cache').sendFile(path.join(directory, 'index.html'));
    });
  }
  app.use(notFoundHandler, problemHandler);
  return app;
}

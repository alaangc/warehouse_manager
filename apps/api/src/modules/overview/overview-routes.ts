import { AdministratorOverviewSchema, DriverOverviewSchema } from '@warehouse/contracts';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuthenticated } from '../../auth/authorization.js';
import type { AppDatabase } from '../../db/database.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { OverviewService } from './overview-service.js';

export function createOverviewRouter(database: AppDatabase): Router {
  const router = Router();
  const service = new OverviewService(database);
  router.get('/overview', requireAuthenticated, async (request, response) => {
    z.object({}).strict().parse(request.query);
    const principal = request.principal!;
    const schema =
      principal.role === 'ADMINISTRATOR' ? AdministratorOverviewSchema : DriverOverviewSchema;
    const result = schema.safeParse(await service.get(principal));
    if (!result.success) throw new HttpProblem(500, 'RESPONSE_INVALID', 'Internal Server Error');
    response.json({ data: result.data });
  });
  return router;
}

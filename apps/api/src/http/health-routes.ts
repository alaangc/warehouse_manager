import { Router } from 'express';
import { sql } from 'kysely';
import type { AppDatabase } from '../db/database.js';

export function createHealthRouter(database: AppDatabase): Router {
  const router = Router();
  router.get('/health', async (_request, response) => {
    try {
      await sql`select 1`.execute(database);
      response.json({ status: 'ok' });
    } catch {
      response.status(503).type('application/problem+json').json({
        type: 'https://warehouse-manager.local/problems/not-ready',
        title: 'Service Unavailable',
        status: 503,
        code: 'NOT_READY',
        detail: 'A required dependency is unavailable.',
      });
    }
  });
  return router;
}

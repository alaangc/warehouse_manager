import { loadEnvironment } from '../../apps/api/src/config/env.js';
import { createDatabase } from '../../apps/api/src/db/database.js';
import { seedFoundation } from './001_foundation.js';

const environment = loadEnvironment(process.env);
const database = createDatabase(environment.DATABASE_URL);
try {
  await seedFoundation(database);
} finally {
  await database.destroy();
}

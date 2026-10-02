import { startServer } from './server.js';
import { loadEnvironment } from './config/env.js';

const environment = loadEnvironment(process.env);
try {
  await startServer(environment);
  process.stdout.write(`Warehouse Manager API listening on ${environment.PORT}\n`);
} catch {
  process.stderr.write(
    'API startup failed: verify database schema readiness and listener configuration.\n',
  );
  process.exitCode = 1;
}

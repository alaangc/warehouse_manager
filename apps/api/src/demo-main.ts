import { fileURLToPath } from 'node:url';
import { loadEnvironment } from './config/env.js';
import { startServer } from './server.js';

// Render supplies the assigned HTTPS origin, including any generated name suffix.
const environment = loadEnvironment({
  ...process.env,
  APP_ORIGIN: process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL,
});
try {
  await startServer(environment, {
    webDirectory: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
  });
  process.stdout.write(`Warehouse demo listening on ${environment.PORT}\n`);
} catch {
  process.stderr.write(
    'Demo startup failed: verify schema readiness and listener configuration.\n',
  );
  process.exitCode = 1;
}

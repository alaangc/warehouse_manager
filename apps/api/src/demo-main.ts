import { fileURLToPath } from 'node:url';
import { loadEnvironment } from './config/env.js';
import { createServer } from './server.js';

// Render supplies the assigned HTTPS origin, including any generated name suffix.
const environment = loadEnvironment({
  ...process.env,
  APP_ORIGIN: process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL,
});
const app = createServer(environment, {
  webDirectory: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
});

app.listen(environment.PORT, '0.0.0.0', () => {
  process.stdout.write(`Warehouse demo listening on ${environment.PORT}\n`);
});

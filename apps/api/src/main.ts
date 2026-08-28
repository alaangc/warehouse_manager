import { createServer } from './server.js';
import { loadEnvironment } from './config/env.js';

const environment = loadEnvironment(process.env);
const app = createServer(environment);

app.listen(environment.PORT, () => {
  process.stdout.write(`Warehouse Manager API listening on ${environment.PORT}\n`);
});

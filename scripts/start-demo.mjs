import { spawnSync } from 'node:child_process';
import process from 'node:process';

if (process.env.DEMO_MODE !== 'true') throw new Error('DEMO_MODE=true is required.');
process.env.APP_ORIGIN ||= process.env.RENDER_EXTERNAL_URL;

// Validate before any database mutation. Do not weaken the production HTTPS gate
// or guess Render's internal proxy addresses; the operator must verify them.
const { loadEnvironment } = await import('../apps/api/dist/config/env.js');
const environment = loadEnvironment(process.env);
if (environment.NODE_ENV === 'production' && !environment.TRUST_PROXY) {
  throw new Error('Set TRUST_PROXY to verified ingress proxy IPs/CIDRs before deployment.');
}

// Free services do not support pre-deploy commands. Fail before listening if
// migrations or initialization fail. This never invokes the development seed.
for (const script of ['apps/api/src/db/migrate.ts', 'database/seeds/demo.ts']) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await import('../apps/api/dist/demo-main.js');

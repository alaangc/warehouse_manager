import { spawnSync } from 'node:child_process';
import process from 'node:process';

if (process.env.DEMO_MODE !== 'true') throw new Error('DEMO_MODE=true is required.');
process.env.APP_ORIGIN ||= process.env.RENDER_EXTERNAL_URL;

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

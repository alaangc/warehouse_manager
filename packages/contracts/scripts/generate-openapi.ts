import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const planningContract = resolve(
  packageDirectory,
  '../../specs/001-warehouse-management/contracts/openapi.yaml',
);
const generatedContract = resolve(packageDirectory, 'openapi.yaml');
await copyFile(planningContract, generatedContract);
await mkdir(resolve(packageDirectory, 'src/generated'), { recursive: true });
await writeFile(
  resolve(packageDirectory, 'src/generated/contract-stamp.ts'),
  `// Generated from the reviewed planning contract.\nexport const contractVersion = '1.0.0' as const;\n`,
);
process.stdout.write(`Generated ${generatedContract}\n`);

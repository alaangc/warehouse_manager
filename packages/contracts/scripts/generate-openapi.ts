import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateArtifacts } from './contract-artifacts.js';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const planningContract = resolve(
  packageDirectory,
  '../../specs/001-warehouse-management/contracts/openapi.yaml',
);
const source = await readFile(planningContract, 'utf8');
for (const [path, contents] of Object.entries(await generateArtifacts(source))) {
  const target = resolve(packageDirectory, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
  process.stdout.write(`Generated ${path}\n`);
}

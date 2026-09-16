import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkArtifacts, generateArtifacts } from './contract-artifacts.js';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(
  resolve(packageDirectory, '../../specs/001-warehouse-management/contracts/openapi.yaml'),
  'utf8',
);
const expected = await generateArtifacts(source);
const actual = Object.fromEntries(
  await Promise.all(
    Object.keys(expected).map(async (path) => [
      path,
      await readFile(resolve(packageDirectory, path), 'utf8'),
    ]),
  ),
);
checkArtifacts(expected, actual);
process.stdout.write('OpenAPI, generated path/schema types, and version/hash stamp are current.\n');

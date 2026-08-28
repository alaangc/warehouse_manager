import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [planned, generated] = await Promise.all([
  readFile(
    resolve(packageDirectory, '../../specs/001-warehouse-management/contracts/openapi.yaml'),
    'utf8',
  ),
  readFile(resolve(packageDirectory, 'openapi.yaml'), 'utf8'),
]);
const normalize = (value: string) => value.replaceAll('\r\n', '\n').trim();
if (normalize(planned) !== normalize(generated))
  throw new Error('Generated OpenAPI differs from the reviewed planning contract.');
process.stdout.write('OpenAPI semantics match the reviewed planning contract.\n');

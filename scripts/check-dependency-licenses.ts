import { createHash } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserViolations } from './check-browser-bundle-secrets.ts';

const accepted = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'Python-2.0',
  'Unlicense',
  'CC0-1.0',
  'MPL-2.0',
  '(MIT OR CC0-1.0)',
]);

export function declaredLicense(pkg: {
  license?: unknown;
  licenses?: unknown;
}): string | undefined {
  if (typeof pkg.license === 'string') return pkg.license;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length === 1) {
    const entry = pkg.licenses[0] as { type?: unknown };
    if (typeof entry?.type === 'string') return entry.type;
  }
  return undefined;
}

export function acceptedLicense(license: string | undefined): boolean {
  return license !== undefined && accepted.has(license);
}

async function main() {
  const store = path.resolve('node_modules/.pnpm');
  const seen = new Set<string>();
  const packages: Array<{ name: string; version: string; license: string }> = [];
  const failures: string[] = [];
  for (const entry of await readdir(store, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const modules = path.join(store, entry.name, 'node_modules');
    for (const name of await readdir(modules)) {
      if (name === '.bin') continue;
      const base = path.join(modules, name);
      const directories = name.startsWith('@')
        ? (await readdir(base)).map((scope) => path.join(base, scope))
        : [base];
      for (const directory of directories) {
        const resolved = await realpath(directory);
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        const pkg = JSON.parse(await readFile(path.join(resolved, 'package.json'), 'utf8')) as {
          name: string;
          version: string;
          license?: unknown;
          licenses?: unknown;
        };
        let license = declaredLicense(pkg);
        // This exact installed release omits metadata but ships an MIT LICENSE.
        if (!license && pkg.name === 'png-js' && pkg.version === '2.0.0') {
          const text = await readFile(path.join(resolved, 'LICENSE'), 'utf8');
          if (
            createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex') ===
            'bdb26a2ec815931ed6a38f3416362566204ee85ecdef96702b636402da4c75c3'
          )
            license = 'MIT';
        }
        if (!acceptedLicense(license))
          failures.push(`${pkg.name}@${pkg.version}: unreviewed license`);
        if (browserViolations(`${pkg.name}@${pkg.version}`).includes('paid-mui-package'))
          failures.push(`${pkg.name}@${pkg.version}: paid MUI package`);
        packages.push({ name: pkg.name, version: pkg.version, license: license ?? 'UNKNOWN' });
      }
    }
  }
  if (packages.length === 0) throw new Error('No installed dependencies found');
  console.log(
    JSON.stringify(
      packages.sort((a, b) => a.name.localeCompare(b.name)),
      null,
      2,
    ),
  );
  if (failures.length) throw new Error(failures.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'License scan failed');
    process.exitCode = 1;
  });

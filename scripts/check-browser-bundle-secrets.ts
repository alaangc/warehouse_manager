import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function browserViolations(text: string, secrets: string[] = []): string[] {
  const violations: string[] = [];
  if (/@mui\/x-(?:[\w-]+-(?:pro|premium)|license(?:-pro)?)(?=[@/:'"\s]|$)/i.test(text))
    violations.push('paid-mui-package');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
    violations.push('private-key');
  if (/postgres(?:ql)?:\/\/[^\s"'/:]+:[^\s"'@]+@/i.test(text))
    violations.push('database-credentials');
  if (/\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}|AKIA[A-Z0-9]{16})\b/.test(text))
    violations.push('credential-token');
  for (const secret of secrets.filter((value) => value.length >= 8)) {
    if (
      [
        secret,
        JSON.stringify(secret).slice(1, -1),
        encodeURIComponent(secret),
        Buffer.from(secret).toString('base64'),
      ].some((value) => text.includes(value))
    ) {
      violations.push('server-secret-value');
      break;
    }
  }
  return violations;
}

export async function scanBrowserBundle(
  directory: string,
  secrets: string[] = [],
): Promise<string[]> {
  let assets = 0;
  const findings: string[] = [];
  async function visit(root: string): Promise<void> {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const file = path.join(root, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Bundle symlinks are not supported');
      if (entry.isDirectory()) await visit(file);
      else {
        assets++;
        for (const rule of browserViolations(await readFile(file, 'utf8'), secrets))
          findings.push(`${path.relative(directory, file)}: ${rule}`);
      }
    }
  }
  await visit(directory);
  if (assets === 0) throw new Error('Browser bundle is empty');
  return findings;
}

async function main() {
  const names = Object.keys(process.env).filter((name) =>
    /(?:SECRET|TOKEN|PASSWORD|DATABASE_URL|PGPASSWORD|PRIVATE_KEY|API_KEY)/i.test(name),
  );
  const secrets = names.flatMap((name) => (process.env[name] ? [process.env[name]!] : []));
  const findings = await scanBrowserBundle(path.resolve('apps/web/dist'), secrets);
  // The lockfile also catches paid packages whose names are removed by minification.
  findings.push(...browserViolations(await readFile('pnpm-lock.yaml', 'utf8')));
  if (findings.length) throw new Error(`Browser security scan failed:\n${findings.join('\n')}`);
  console.log('Browser bundle and lockfile security checks passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Browser security scan failed');
    process.exitCode = 1;
  });

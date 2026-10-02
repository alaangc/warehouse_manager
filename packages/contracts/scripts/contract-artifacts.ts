import { createHash } from 'node:crypto';
import { format } from 'prettier';
import openapiTS, { astToString, type OpenAPI3 } from 'openapi-typescript';
import { parse } from 'yaml';

export async function generateArtifacts(source: string): Promise<Record<string, string>> {
  const document = parse(source) as OpenAPI3;
  const types = astToString(await openapiTS(document));
  const aliases = `
export type ApiPaths = paths;
export type UserRole = components['schemas']['UserRole'];
export type SessionUser = components['schemas']['SessionUser'];
export type SessionResponse = components['schemas']['SessionResponse'];
export type ProblemDetails = components['schemas']['Problem'];
`;
  const normalized = source.replaceAll('\r\n', '\n');
  return {
    'openapi.yaml': normalized,
    'src/generated/api-types.ts': await format(types + aliases, {
      parser: 'typescript',
      singleQuote: true,
      printWidth: 100,
      trailingComma: 'all',
    }),
    'src/generated/contract-stamp.ts': await format(
      `// Generated from the reviewed planning contract.\nexport const contractVersion = '${document.info.version}' as const;\nexport const contractSha256 = '${createHash('sha256').update(normalized).digest('hex')}' as const;\n`,
      { parser: 'typescript', singleQuote: true, printWidth: 100, trailingComma: 'all' },
    ),
  };
}

export function checkArtifacts(
  expected: Record<string, string>,
  actual: Record<string, string>,
): void {
  const stale = Object.keys(expected).filter(
    (path) => expected[path]?.replaceAll('\r\n', '\n') !== actual[path]?.replaceAll('\r\n', '\n'),
  );
  if (stale.length)
    throw new Error(
      `Stale generated artifacts: ${stale.join(', ')}. Run pnpm contract:generate and commit the results.`,
    );
}

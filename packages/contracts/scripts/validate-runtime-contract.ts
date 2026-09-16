import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Ajv2020, type AnySchemaObject, type ValidateFunction } from 'ajv/dist/2020.js';
import formats from 'ajv-formats';
import { parse } from 'yaml';

type Ref<T> = T | { $ref: string };
type Content = Record<string, { schema?: AnySchemaObject }>;
type Parameter = { name: string; in: string; required?: boolean; schema?: AnySchemaObject };
type Response = {
  content?: Content;
  headers?: Record<string, Ref<{ required?: boolean; schema?: AnySchemaObject }>>;
};
type Operation = {
  parameters?: Ref<Parameter>[];
  requestBody?: Ref<{ required?: boolean; content: Content }>;
  responses: Record<string, Ref<Response>>;
};
const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
type PathItem = { parameters?: Ref<Parameter>[] } & Partial<
  Record<(typeof methods)[number], Operation>
>;
export type ContractDocument = {
  paths: Record<string, PathItem>;
  components: { schemas: Record<string, AnySchemaObject> };
};
type Message = { headers?: Record<string, string | string[] | undefined>; body?: unknown };

export function createContractValidator(document: ContractDocument) {
  const ajv = new Ajv2020({
    allErrors: true,
    strictTypes: false,
    strictRequired: false,
    allowUnionTypes: true,
  });
  formats.default(ajv);
  for (const keyword of ['example', 'discriminator', 'xml', 'externalDocs'])
    ajv.addKeyword(keyword);
  ajv.addFormat('binary', true);
  // Keep OpenAPI references local; never fetch schemas from the network.
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          key === '$ref' && typeof child === 'string'
            ? child.replace('#/components/schemas/', 'urn:warehouse:contract#/$defs/')
            : rewrite(child),
        ]),
      );
    return value;
  };
  ajv.addSchema({ $id: 'urn:warehouse:contract', $defs: rewrite(document.components.schemas) });
  const cache = new Map<string, ValidateFunction>();
  const compile = (schema: AnySchemaObject) => {
    const key = JSON.stringify(schema);
    let validator = cache.get(key);
    if (!validator) {
      validator = ajv.compile(rewrite(schema) as AnySchemaObject);
      cache.set(key, validator);
    }
    return validator;
  };
  const validate = (schema: AnySchemaObject, body: unknown, label: string) => {
    const validator = compile(schema);
    if (!validator(body))
      throw new Error(
        `${label}: ${ajv.errorsText(validator.errors)} ${JSON.stringify(validator.errors?.map(({ instancePath, params }) => ({ instancePath, params })))}`,
      );
  };
  const dereference = <T>(input: Ref<T>): T => {
    if (input && typeof input === 'object' && '$ref' in input) {
      const pointer = input.$ref;
      if (typeof pointer !== 'string' || !pointer.startsWith('#/'))
        throw new Error('Only local OpenAPI references are supported');
      let result: unknown = document;
      for (const part of pointer.slice(2).split('/'))
        result = (result as Record<string, unknown>)?.[
          part.replaceAll('~1', '/').replaceAll('~0', '~')
        ];
      if (!result) throw new Error(`Unresolved reference ${pointer}`);
      return result as T;
    }
    return input as T;
  };
  const lookup = (method: string, url: string) => {
    const parsed = new URL(url, 'http://contract.test');
    const pathname = parsed.pathname.replace(/^\/api\/v1(?=\/|$)/, '');
    // Literal routes must win over /{id} routes.
    for (const [path, item] of Object.entries(document.paths).sort(
      ([a], [b]) => Number(a.includes('{')) - Number(b.includes('{')),
    )) {
      const names: string[] = [];
      const expression = path
        .split('/')
        .map((part) => {
          if (part.startsWith('{') && part.endsWith('}')) {
            names.push(part.slice(1, -1));
            return '([^/]+)';
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/');
      const match = new RegExp(`^${expression}$`).exec(pathname);
      if (!match) continue;
      const operation = item[method.toLowerCase() as (typeof methods)[number]];
      if (!operation) throw new Error(`Undocumented operation ${method} ${path}`);
      return {
        operation,
        item,
        parsed,
        params: Object.fromEntries(
          names.map((name, index) => [name, decodeURIComponent(match[index + 1]!)]),
        ),
      };
    }
    throw new Error(`Undocumented operation ${method} ${pathname}`);
  };
  const headersOf = (message: Message) =>
    Object.fromEntries(
      Object.entries(message.headers ?? {}).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? value.join(', ') : value,
      ]),
    );
  const contentBody = (content: Content, message: Message, label: string) => {
    const mediaType = headersOf(message)['content-type']?.split(';')[0]?.trim();
    const media = content[mediaType ?? ''];
    if (!media) throw new Error(`${label}: undocumented media type ${mediaType ?? '(missing)'}`);
    if (mediaType === 'application/pdf') {
      if (!Buffer.isBuffer(message.body) || message.body.subarray(0, 5).toString() !== '%PDF-')
        throw new Error(`${label}: invalid PDF bytes`);
    } else if (media.schema) validate(media.schema, message.body, label);
  };
  // Compile every named and inline schema, including unexercised endpoints.
  for (const name of Object.keys(document.components.schemas))
    compile({ $ref: `#/components/schemas/${name}` });
  for (const item of Object.values(document.paths))
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      for (const parameter of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
        const schema = dereference(parameter).schema;
        if (schema) compile(schema);
      }
      if (operation.requestBody)
        for (const media of Object.values(dereference(operation.requestBody).content))
          if (media.schema) compile(media.schema);
      for (const response of Object.values(operation.responses)) {
        const resolved = dereference(response);
        for (const media of Object.values(resolved.content ?? {}))
          if (media.schema) compile(media.schema);
        for (const header of Object.values(resolved.headers ?? {})) {
          const schema = dereference(header).schema;
          if (schema) compile(schema);
        }
      }
    }
  return {
    schema(name: string, value: unknown) {
      validate({ $ref: `#/components/schemas/${name}` }, value, name);
    },
    request(method: string, url: string, message: Message) {
      const { operation, item, params, parsed } = lookup(method, url);
      const headers = headersOf(message);
      for (const ref of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
        const parameter = dereference(ref);
        let value: unknown =
          parameter.in === 'header'
            ? headers[parameter.name.toLowerCase()]
            : parameter.in === 'path'
              ? params[parameter.name]
              : parameter.in === 'query'
                ? (parsed.searchParams.get(parameter.name) ?? undefined)
                : undefined;
        if (value === undefined) {
          if (parameter.required) throw new Error(`request: missing ${parameter.name}`);
          continue;
        }
        const schema = parameter.schema;
        if (schema?.type === 'integer' && typeof value === 'string' && /^-?\d+$/.test(value))
          value = Number(value);
        if (schema?.type === 'boolean' && (value === 'true' || value === 'false'))
          value = value === 'true';
        if (schema) validate(schema, value, `request ${parameter.name}`);
      }
      if (operation.requestBody) {
        const body = dereference(operation.requestBody);
        if (message.body === undefined) {
          if (body.required) throw new Error('request: missing body');
        } else contentBody(body.content, message, 'request body');
      } else if (message.body !== undefined) throw new Error('request: undocumented body');
    },
    response(method: string, url: string, message: Message & { status: number }) {
      let found: ReturnType<typeof lookup>;
      try {
        found = lookup(method, url);
      } catch (error) {
        // The router's documented not-found boundary is also tested with URLs
        // that intentionally do not appear in paths. Never exempt successes.
        if (
          message.status !== 404 ||
          !message.body ||
          typeof message.body !== 'object' ||
          !('code' in message.body) ||
          message.body.code !== 'RESOURCE_NOT_FOUND'
        )
          throw error;
        contentBody(
          { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
          message,
          'not-found response',
        );
        return;
      }
      const { operation } = found;
      const definition =
        operation.responses[String(message.status)] ??
        operation.responses[`${Math.floor(message.status / 100)}XX`] ??
        operation.responses['default'];
      if (!definition) throw new Error(`Undocumented response ${method} ${url}: ${message.status}`);
      const response = dereference(definition);
      const headers = headersOf(message);
      for (const [name, ref] of Object.entries(response.headers ?? {})) {
        const header = dereference(ref);
        const value = headers[name.toLowerCase()];
        if (value === undefined) {
          if (header.required) throw new Error(`response: missing header ${name}`);
        } else if (header.schema) validate(header.schema, value, `response header ${name}`);
      }
      if (response.content) contentBody(response.content, message, 'response body');
      else if (
        message.body !== undefined &&
        message.body !== '' &&
        !(Buffer.isBuffer(message.body) && message.body.length === 0)
      )
        throw new Error('response: expected empty body');
    },
  };
}

export async function loadContractValidator() {
  const document = parse(
    await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8'),
  ) as ContractDocument;
  return createContractValidator(document);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadContractValidator();
  process.stdout.write(
    'Every OpenAPI request/response schema compiles under JSON Schema 2020-12.\n',
  );
}

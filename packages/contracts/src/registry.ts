import type { z } from 'zod';

export type ContractSchema = z.ZodType;
export type RegisteredSchema = { name: string; schema: ContractSchema; description?: string };
const schemas = new Map<string, RegisteredSchema>();

export function registerSchema<T extends ContractSchema>(
  name: string,
  schema: T,
  description?: string,
): T {
  if (schemas.has(name)) throw new Error(`Contract schema already registered: ${name}`);
  schemas.set(name, description === undefined ? { name, schema } : { name, schema, description });
  return schema;
}

export function getRegisteredSchemas(): readonly RegisteredSchema[] {
  return [...schemas.values()].sort((left, right) => left.name.localeCompare(right.name));
}

import { z } from 'zod';

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['test', 'development', 'production']).default('development'),
    DATABASE_URL: z.string().url().startsWith('postgres'),
    SESSION_SECRET: z.string().min(32),
    APP_ORIGIN: z.string().url(),
    BUSINESS_TIMEZONE: z.string().min(1).refine(isIanaTimezone, 'Invalid IANA timezone'),
    BUSINESS_CURRENCY: z.string().regex(/^[A-Z]{3}$/),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    DOCUMENT_STORAGE_PATH: z.string().min(1),
  })
  .strict();

export type Environment = z.infer<typeof EnvironmentSchema>;

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function loadEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = EnvironmentSchema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.') || 'environment');
    throw new Error(`Invalid application configuration: ${[...new Set(fields)].join(', ')}`);
  }
  return result.data;
}

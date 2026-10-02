import 'dotenv/config';
import { isIP } from 'node:net';
import { z } from 'zod';

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['test', 'development', 'production']).default('development'),
    DATABASE_URL: z.string().url().startsWith('postgres'),
    SESSION_SECRET: z.string().min(32),
    APP_ORIGIN: z
      .string()
      .url()
      .refine((value) => {
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && value === url.origin;
      }, 'Expected an HTTP origin without a path or credentials'),
    TRUST_PROXY: z
      .string()
      .refine(
        (value) =>
          value.split(',').every((entry) => {
            const [address, prefix, extra] = entry.trim().split('/');
            const family = isIP(address ?? '');
            return (
              family !== 0 &&
              extra === undefined &&
              (prefix === undefined ||
                (/^\d+$/.test(prefix) &&
                  Number(prefix) > 0 &&
                  Number(prefix) <= (family === 4 ? 32 : 128)))
            );
          }),
        'Expected explicit proxy IP addresses or CIDRs',
      )
      .optional(),
    BUSINESS_TIMEZONE: z.string().min(1).refine(isIanaTimezone, 'Invalid IANA timezone'),
    BUSINESS_CURRENCY: z.string().regex(/^[A-Z]{3}$/),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    DOCUMENT_STORAGE_PATH: z.string().min(1),
  })
  .strip()
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== 'production') return;
    if (!environment.APP_ORIGIN.startsWith('https://'))
      context.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'HTTPS required' });
    const secret = environment.SESSION_SECRET;
    if (
      secret.trim() !== secret ||
      new Set(secret).size < 12 ||
      /replace|example|changeme|test-secret|development/i.test(secret)
    )
      context.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'Use a random production secret',
      });
  });

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

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';
import { HttpProblem } from '../../http/problem-handler.js';

export type HistoryPrincipal = { id: string; role: 'ADMINISTRATOR' | 'DRIVER' };
export type CursorScope = {
  principal: HistoryPrincipal;
  resource: string;
  filters: Record<string, string | undefined>;
};
const positionSchema = z
  .object({ id: z.uuid(), createdAt: z.iso.datetime({ offset: true }) })
  .strict();
export type CursorPosition = z.infer<typeof positionSchema>;
const payloadSchema = z
  .object({ position: positionSchema, scope: z.string(), version: z.literal(1) })
  .strict();

export function normalizeHistoryTime(value: string): string {
  try {
    return Temporal.Instant.from(value).toString({ fractionalSecondDigits: 9 });
  } catch {
    throw new HttpProblem(422, 'INVALID_HISTORY_TIME', 'Invalid history timestamp');
  }
}

function scopeHash(scope: CursorScope): string {
  const filters = Object.entries(scope.filters)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256')
    .update(
      JSON.stringify([
        scope.resource,
        scope.principal.id.toLowerCase(),
        scope.principal.role,
        filters,
      ]),
    )
    .digest('hex');
}

/** Inject the same server secret on every instance; never use a browser-supplied key. */
export class ScopedCursor {
  private readonly key: Buffer;
  constructor(secret: string) {
    if (Buffer.byteLength(secret) < 32)
      throw new Error('Cursor secret must contain at least 32 bytes');
    this.key = createHash('sha256').update('warehouse-history-cursor-v1\0').update(secret).digest();
  }

  encode(position: CursorPosition, scope: CursorScope): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const bytes = Buffer.from(
      JSON.stringify({
        position: positionSchema.parse(position),
        scope: scopeHash(scope),
        version: 1,
      }),
    );
    return Buffer.concat([
      nonce,
      cipher.update(bytes),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64url');
  }

  decode(token: string, scope: CursorScope): CursorPosition {
    let payload: z.infer<typeof payloadSchema>;
    try {
      if (token.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(token))
        throw new Error('Invalid encoding');
      const bytes = Buffer.from(token, 'base64url');
      if (bytes.length < 29 || bytes.toString('base64url') !== token)
        throw new Error('Invalid encoding');
      const decipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(-16));
      const plain = Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]);
      payload = payloadSchema.parse(JSON.parse(plain.toString('utf8')) as unknown);
    } catch {
      throw new HttpProblem(422, 'INVALID_HISTORY_CURSOR', 'Invalid history cursor');
    }
    if (payload.scope !== scopeHash(scope)) {
      throw new HttpProblem(
        403,
        'HISTORY_CURSOR_FORBIDDEN',
        'History cursor is outside the requested scope',
      );
    }
    return payload.position;
  }
}

import { describe, expect, it } from 'vitest';
import {
  ScopedCursor,
  normalizeHistoryTime,
} from '../../../src/shared/pagination/scoped-cursor.js';

const principal = { id: '00000000-0000-4000-8000-000000000001', role: 'DRIVER' as const };
const scope = { principal, resource: 'documents', filters: { from: '2036-06-01T00:00:00Z' } };
const position = {
  id: '00000000-0000-4000-8000-000000000002',
  createdAt: '2036-06-01T00:00:00.000002Z',
};

describe('source-scoped history cursors', () => {
  const cursors = new ScopedCursor('test-secret-at-least-thirty-two-characters');
  it('roundtrips exact microseconds without exposing the payload', () => {
    const token = cursors.encode(position, scope);
    expect(cursors.decode(token, scope)).toEqual(position);
    expect(Buffer.from(token, 'base64url').toString()).not.toContain(principal.id);
    expect(token).not.toBe(cursors.encode(position, scope));
  });
  it.each([
    { ...scope, principal: { ...principal, id: position.id } },
    { ...scope, principal: { ...principal, role: 'ADMINISTRATOR' as const } },
    { ...scope, resource: 'output-attempts' },
    { ...scope, filters: { from: '2036-05-01T00:00:00Z' } },
  ])('rejects a valid cursor reused with another scope', (other) => {
    expect(() => cursors.decode(cursors.encode(position, scope), other)).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });
  it('normalizes equivalent timestamps without discarding sub-millisecond precision', () => {
    expect(normalizeHistoryTime('2036-06-01T00:00:00Z')).toBe(
      normalizeHistoryTime('2036-05-31T17:00:00.000-07:00'),
    );
    expect(normalizeHistoryTime(position.createdAt)).not.toBe(
      normalizeHistoryTime('2036-06-01T00:00:00.000001Z'),
    );
  });
  it('canonicalizes filter key order and ignores absent optional values', () => {
    const token = cursors.encode(position, {
      ...scope,
      filters: { state: 'READY', sourceId: position.id, from: undefined },
    });
    expect(
      cursors.decode(token, { ...scope, filters: { sourceId: position.id, state: 'READY' } }),
    ).toEqual(position);
  });
  it('rejects malformed, oversized, corrupted and wrong-key cursors with 422', () => {
    const token = cursors.encode(position, scope);
    for (const invalid of [
      'not-a-valid-cursor',
      'a'.repeat(5000),
      `${token}tampered`,
      `${token}=`,
      '',
    ]) {
      expect(() => cursors.decode(invalid, scope)).toThrowError(
        expect.objectContaining({ status: 422 }),
      );
    }
    expect(() =>
      new ScopedCursor('another-secret-at-least-thirty-two-characters').decode(token, scope),
    ).toThrowError(expect.objectContaining({ status: 422 }));
  });
});

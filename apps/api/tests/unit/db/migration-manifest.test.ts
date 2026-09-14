import { describe, expect, it } from 'vitest';
import {
  reviewedMigrations,
  verifyManifest,
} from '../../../../../database/scripts/drill-support.js';

const original = { '001_foundation.ts': 'a'.repeat(64) };
describe('T134 migration manifest gate', () => {
  it('accepts exactly the reviewed migration hashes', () => {
    expect(() => verifyManifest(original, original)).not.toThrow();
  });
  it('rejects a changed applied migration', () => {
    expect(() => verifyManifest({ '001_foundation.ts': 'b'.repeat(64) }, original)).toThrow(
      'Applied migration changed',
    );
  });
  it.each([{}, { ...original, '002_new.ts': 'b'.repeat(64) }])(
    'rejects missing and unreviewed migrations',
    (actual) => {
      expect(() => verifyManifest(actual, original)).toThrow('must cover every migration');
    },
  );
  it.each([null, [], { '001_foundation.ts': 'invalid' }, { '001_foundation.ts': 123 }])(
    'rejects malformed manifests',
    (manifest) => {
      expect(() => verifyManifest(original, manifest)).toThrow();
    },
  );
  it('rejects migration filenames the ordered runner cannot review', () => {
    const invalid = { 'unreviewed.ts': 'a'.repeat(64) };
    expect(() => verifyManifest(invalid, invalid)).toThrow('Invalid migration filename');
  });
  it('loads every checked-in migration without starting Docker or connecting to a database', async () => {
    const migrations = await reviewedMigrations();
    expect(Object.keys(migrations)).toHaveLength(8);
    expect(Object.values(migrations).every((migration) => typeof migration.up === 'function')).toBe(
      true,
    );
  });
});

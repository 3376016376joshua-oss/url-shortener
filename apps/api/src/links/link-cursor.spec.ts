import { describe, expect, it } from 'vitest';
import { decodeLinkCursor, encodeLinkCursor } from './link-cursor.js';

const cursor = {
  createdAt: '2026-11-27T08:00:00.123456Z',
  id: '0193d2a0-6c1e-7b3a-9f4e-2d1c0b9a8f7e',
};

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('link cursor', () => {
  it('round-trips, keeping microseconds', () => {
    expect(decodeLinkCursor(encodeLinkCursor(cursor))).toEqual(cursor);
  });

  it('is safe to put in a query string', () => {
    expect(encodeLinkCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['text that is not base64 JSON', 'not a cursor'],
    ['an empty object', encode({})],
    ['a malformed id', encode({ ...cursor, id: 'abc' })],
    ['a malformed time', encode({ ...cursor, createdAt: 'yesterday' })],
    ['SQL in the time', encode({ ...cursor, createdAt: "'; DROP TABLE" })],
    ['an extra property', encode({ ...cursor, workspaceId: 'x' })],
    ['a JSON scalar', encode(42)],
  ])('rejects %s', (_description, encoded) => {
    expect(decodeLinkCursor(encoded)).toBeNull();
  });
});

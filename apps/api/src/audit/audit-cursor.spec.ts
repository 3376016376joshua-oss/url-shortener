import { describe, expect, it } from 'vitest';
import { auditActor } from './audit-actor.js';
import { decodeAuditCursor, encodeAuditCursor } from './audit-cursor.js';

const CURSOR = {
  createdAt: '2026-11-27 08:00:00.123456+00',
  id: '0193d2a0-6c1e-7b3a-9f4e-2d1c0b9a8f7e',
};

const encode = (text: string): string =>
  Buffer.from(text).toString('base64url');

describe('audit cursor', () => {
  it('round-trips, keeping every microsecond', () => {
    expect(decodeAuditCursor(encodeAuditCursor(CURSOR))).toEqual(CURSOR);
  });

  it('is URL-safe', () => {
    expect(encodeAuditCursor(CURSOR)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['plain text', 'not-a-cursor'],
    ['a timestamp without an id', encode(CURSOR.createdAt)],
    ['an id that is not a UUID', encode(`${CURSOR.createdAt}|42`)],
    ['SQL in place of the timestamp', encode(`now(); --|${CURSOR.id}`)],
    ['extra parts', encode(`${CURSOR.createdAt}|${CURSOR.id}|more`)],
  ])('rejects %s with 400 VALIDATION_FAILED', (_case, cursor) => {
    expect(() => decodeAuditCursor(cursor)).toThrow(
      expect.objectContaining({
        status: 400,
        response: expect.objectContaining({
          code: 'VALIDATION_FAILED',
        }) as unknown,
      }),
    );
  });
});

describe('auditActor', () => {
  const base = { isPlatformAdmin: false, memberships: [] };

  it('names the user behind a session', () => {
    expect(
      auditActor({ ...base, kind: 'session', userId: 'u1', apiKeyId: null }),
    ).toEqual({ type: 'user', id: 'u1' });
  });

  it('names the key behind an API request', () => {
    expect(
      auditActor({ ...base, kind: 'api_key', userId: null, apiKeyId: 'k1' }),
    ).toEqual({ type: 'api_key', id: 'k1' });
  });
});

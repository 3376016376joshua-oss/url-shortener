import { describe, expect, it } from 'vitest';
import {
  BASE62_ALPHABET,
  GENERATED_CODE_LENGTH,
  SHORT_CODE_MAX_LENGTH,
  SHORT_CODE_MIN_LENGTH,
  isReservedShortCode,
  isWellFormedShortCode,
} from './short-code.js';

describe('BASE62_ALPHABET', () => {
  it('holds 62 distinct characters', () => {
    expect(new Set(BASE62_ALPHABET).size).toBe(62);
    expect(BASE62_ALPHABET).toHaveLength(62);
  });

  it('only produces well-formed codes', () => {
    for (const character of BASE62_ALPHABET) {
      const code = character.repeat(GENERATED_CODE_LENGTH);

      expect(isWellFormedShortCode(code)).toBe(true);
    }
  });
});

describe('isWellFormedShortCode', () => {
  it.each(['aB92xK7', 'my-link', 'my_link', 'abc', 'A'.repeat(32)])(
    'accepts %s',
    (code) => {
      expect(isWellFormedShortCode(code)).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['shorter than the minimum', 'a'.repeat(SHORT_CODE_MIN_LENGTH - 1)],
    ['longer than the maximum', 'a'.repeat(SHORT_CODE_MAX_LENGTH + 1)],
    ['a dot', 'robots.txt'],
    ['a slash', 'abc/def'],
    ['a space', 'abc def'],
    ['a non-ASCII letter', 'café'],
    ['a trailing newline', 'abcdef\n'],
  ])('rejects a code with %s', (_reason, code) => {
    expect(isWellFormedShortCode(code)).toBe(false);
  });
});

describe('isReservedShortCode', () => {
  it.each(['api', 'health', 'metrics', 'admin', 'login'])(
    'reserves %s',
    (code) => {
      expect(isReservedShortCode(code)).toBe(true);
    },
  );

  it('reserves a word regardless of case', () => {
    expect(isReservedShortCode('API')).toBe(true);
    expect(isReservedShortCode('Health')).toBe(true);
  });

  it('does not reserve an ordinary code', () => {
    expect(isReservedShortCode('aB92xK7')).toBe(false);
  });
});

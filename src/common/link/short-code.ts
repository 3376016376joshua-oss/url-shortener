/** Alphabet for generated codes. Custom aliases may also use `_` and `-`. */
export const BASE62_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const GENERATED_CODE_LENGTH = 7;
export const SHORT_CODE_MIN_LENGTH = 3;
export const SHORT_CODE_MAX_LENGTH = 32;

const SHORT_CODE_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${SHORT_CODE_MIN_LENGTH},${SHORT_CODE_MAX_LENGTH}}$`,
);

/**
 * Single-segment paths the application serves itself, plus names that would
 * mislead if they were someone's link. Compared case-insensitively.
 */
const RESERVED_SHORT_CODES: ReadonlySet<string> = new Set([
  'api',
  'health',
  'metrics',
  'admin',
  'login',
]);

/** True when the value has the shape of a generated code or a custom alias. */
export function isWellFormedShortCode(value: string): boolean {
  return SHORT_CODE_PATTERN.test(value);
}

export function isReservedShortCode(value: string): boolean {
  return RESERVED_SHORT_CODES.has(value.toLowerCase());
}

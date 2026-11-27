import type { Request } from 'express';
import { hashSecret, randomBase62 } from '../tokens/secret-token.js';

const API_KEY_MARKER = 'usk_';
const API_KEY_SECRET_LENGTH = 40;
/** How much of a key is kept in the clear, so people can tell keys apart. */
const API_KEY_DISPLAY_LENGTH = 12;
const API_KEY_PATTERN = new RegExp(
  `^${API_KEY_MARKER}[0-9A-Za-z]{${API_KEY_SECRET_LENGTH}}$`,
);
const BEARER_PATTERN = /^Bearer +(\S+)$/i;

export interface NewApiKey {
  /** Shown to the caller once and never stored. */
  key: string;
  keyPrefix: string;
  keyHash: Buffer;
}

export function generateApiKey(): NewApiKey {
  const key = API_KEY_MARKER + randomBase62(API_KEY_SECRET_LENGTH);
  return {
    key,
    keyPrefix: key.slice(0, API_KEY_DISPLAY_LENGTH),
    keyHash: hashSecret(key),
  };
}

export function isWellFormedApiKey(value: string): boolean {
  return API_KEY_PATTERN.test(value);
}

/** The value of `Authorization: Bearer <value>`, or `null` without one. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (header === undefined) {
    return null;
  }
  return BEARER_PATTERN.exec(header)?.[1] ?? null;
}

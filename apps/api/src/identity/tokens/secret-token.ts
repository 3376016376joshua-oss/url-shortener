import { createHash, randomBytes, randomInt } from 'node:crypto';
import { BASE62_ALPHABET } from '../../common/link/short-code.js';

/** 256 bits: the size the PRD asks of a session token, used for every token. */
const SECRET_TOKEN_BYTES = 32;

/** A new random token, safe to put in a cookie or a URL. */
export function generateSecretToken(): string {
  return randomBytes(SECRET_TOKEN_BYTES).toString('base64url');
}

/**
 * What is stored in place of a token or key. The secrets are long and random,
 * so a plain SHA-256 is enough: there is nothing to brute-force.
 */
export function hashSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** Hex form of `hashSecret`, for Redis keys that must not hold the value. */
export function fingerprint(value: string): string {
  return hashSecret(value).toString('hex');
}

/** Random Base62 characters from the CSPRNG, without modulo bias. */
export function randomBase62(length: number): string {
  return Array.from(
    { length },
    () => BASE62_ALPHABET[randomInt(BASE62_ALPHABET.length)],
  ).join('');
}

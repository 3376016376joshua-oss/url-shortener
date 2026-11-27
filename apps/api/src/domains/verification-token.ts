import { randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'sv_';
/** 128 bits: a claim's token cannot be guessed by another workspace. */
const TOKEN_BYTES = 16;

/** The value a workspace publishes in DNS to prove it controls a host. */
export function generateVerificationToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('hex')}`;
}

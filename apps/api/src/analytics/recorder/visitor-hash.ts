import { createHmac } from 'node:crypto';

/**
 * The value added to a day's unique-visitor sketch: a keyed hash of the
 * address and user agent. It exists only long enough to be added to the
 * sketch, from which it cannot be read back, and is useless once the day's
 * salt has expired.
 */
export function hashVisitor(
  salt: string,
  ip: string,
  userAgent: string | null,
): string {
  return (
    createHmac('sha256', salt)
      .update(ip)
      // A separator, so ("1.2.3.4", "5...") and ("1.2.3.45", "...") differ.
      .update('\n')
      .update(userAgent ?? '')
      .digest('hex')
  );
}

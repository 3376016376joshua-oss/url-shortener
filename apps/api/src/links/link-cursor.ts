import { z } from 'zod';

/**
 * Where a page of links ended: the last row's creation time and id. The time
 * is the database's own text with microseconds, because a JavaScript `Date`
 * would round it and make the next page repeat or skip rows.
 */
const linkCursorSchema = z.strictObject({
  createdAt: z.iso.datetime({ precision: 6 }),
  id: z.uuid(),
});
export type LinkCursor = z.infer<typeof linkCursorSchema>;

export function encodeLinkCursor(cursor: LinkCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Returns `null` for anything this module did not produce. */
export function decodeLinkCursor(encoded: string): LinkCursor | null {
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    );
    return linkCursorSchema.safeParse(decoded).data ?? null;
  } catch {
    // Not JSON: the caller reports it as a malformed cursor.
    return null;
  }
}

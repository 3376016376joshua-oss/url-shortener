import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import { ApiException } from '../common/errors/api-exception.js';

/** Where a page of the audit log ended: the last entry's time and id. */
export interface AuditCursor {
  /** Postgres text form, kept verbatim so no microsecond is lost. */
  createdAt: string;
  id: string;
}

const SEPARATOR = '|';
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
/** `2026-11-27 08:00:00.123456+00`, as `timestamptz::text` prints in UTC. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00$/;

export function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(`${cursor.createdAt}${SEPARATOR}${cursor.id}`).toString(
    'base64url',
  );
}

/** Rejects anything this module did not issue with 400, before it reaches SQL. */
export function decodeAuditCursor(encoded: string): AuditCursor {
  const [createdAt, id, ...rest] = Buffer.from(encoded, 'base64url')
    .toString('utf8')
    .split(SEPARATOR);
  if (
    createdAt === undefined ||
    id === undefined ||
    rest.length > 0 ||
    !TIMESTAMP.test(createdAt) ||
    !UUID.test(id)
  ) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'cursor: is not a cursor returned by this endpoint',
    );
  }
  return { createdAt, id };
}

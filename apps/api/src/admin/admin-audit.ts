import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import type { AuditEntry } from '../audit/audit-log.js';
import { ApiException } from '../common/errors/api-exception.js';
import { AuditActorType } from '../database/entities/audit-log-entry.entity.js';
import type { Principal } from '../identity/principal.js';

/** The platform admin behind a request, as the actor of an audit entry. */
export function adminActor(admin: Principal): AuditEntry['actor'] {
  return { type: AuditActorType.User, id: admin.userId };
}

export function notFound(what: string): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NotFound,
    `${what} not found`,
  );
}

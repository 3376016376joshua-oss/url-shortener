import type { AuditEntry } from '../audit/audit-log.js';
import { AuditActorType } from '../database/entities/audit-log-entry.entity.js';
import type { Principal } from '../identity/principal.js';

/** Who the audit log names for a request: the user, or the API key that made it. */
export function toAuditActor(principal: Principal): AuditEntry['actor'] {
  return principal.kind === 'api_key'
    ? { type: AuditActorType.ApiKey, id: principal.apiKeyId }
    : { type: AuditActorType.User, id: principal.userId };
}

import type { AuditEntry } from '../audit/audit-log.js';
import type { Principal } from '../identity/principal.js';

export type AuditActor = AuditEntry['actor'];

/** The actor of work nobody asked for, such as a scheduled check. */
export const SYSTEM_ACTOR: AuditActor = { type: 'system', id: null };

/** The caller of a request, as the audit log names them. */
export function toAuditActor(principal: Principal): AuditActor {
  return principal.kind === 'api_key'
    ? { type: 'api_key', id: principal.apiKeyId }
    : { type: 'user', id: principal.userId };
}

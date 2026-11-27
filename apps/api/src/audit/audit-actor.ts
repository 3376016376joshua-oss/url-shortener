import { AuditActorType } from '../database/entities/audit-log-entry.entity.js';
import type { Principal } from '../identity/principal.js';
import type { AuditEntry } from './audit-log.js';

/** The audit actor for whoever made the request. */
export function auditActor(principal: Principal): AuditEntry['actor'] {
  return principal.kind === 'api_key'
    ? { type: AuditActorType.ApiKey, id: principal.apiKeyId }
    : { type: AuditActorType.User, id: principal.userId };
}

export const userActor = (userId: string): AuditEntry['actor'] => ({
  type: AuditActorType.User,
  id: userId,
});

/** For changes nobody asked for, such as a lock triggered by failed sign-ins. */
export const SYSTEM_ACTOR: AuditEntry['actor'] = {
  type: AuditActorType.System,
  id: null,
};

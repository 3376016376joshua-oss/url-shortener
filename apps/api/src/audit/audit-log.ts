import type { AuditActorType } from '../database/entities/audit-log-entry.entity.js';

export interface AuditEntry {
  /** `null` for a platform-level action. */
  workspaceId: string | null;
  actor: { type: AuditActorType; id: string | null };
  /** `<target>.<verb>`, for example `link.created` or `domain.verified`. */
  action: string;
  target: { type: string; id: string | null };
  /** Never put secrets or full destination URLs here. */
  metadata?: Record<string, unknown>;
}

/** How feature modules record who changed what. */
export abstract class AuditLog {
  /** Await it: an action that is not recorded should not report success. */
  abstract record(entry: AuditEntry): Promise<void>;
}

import type { EntityManager } from 'typeorm';
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
  /**
   * Await it: an action that is not recorded should not report success.
   * Pass the transaction's `manager` to commit the entry together with the
   * change it describes; without one the entry is written on its own.
   */
  abstract record(entry: AuditEntry, manager?: EntityManager): Promise<void>;
}

import { Injectable } from '@nestjs/common';
import type {
  AuditLogEntryView,
  AuditLogPage,
  AuditLogQuery,
} from '@url-shortener/contracts/workspaces';
import { DataSource } from 'typeorm';
import type { AuditActorType } from '../database/entities/audit-log-entry.entity.js';
import { decodeAuditCursor, encodeAuditCursor } from './audit-cursor.js';

interface AuditRow {
  id: string;
  actor_type: AuditActorType;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  /** `created_at` at full precision, for the cursor. */
  created_at_text: string;
}

/**
 * Newest first, paged by `(created_at, id)` so the existing
 * `(workspace_id, created_at)` index serves every page. The cursor carries
 * the timestamp as Postgres text, verbatim: a JavaScript date would drop the
 * microseconds and skip or repeat entries.
 */
const PAGE_QUERY = `
  SELECT entry."id", entry."actor_type", entry."actor_id", entry."action",
         entry."target_type", entry."target_id", entry."metadata",
         entry."created_at",
         (entry."created_at" AT TIME ZONE 'UTC')::text || '+00' AS "created_at_text",
         COALESCE(actor_user."name", actor_key."name") AS "actor_name"
    FROM "audit_log" entry
    LEFT JOIN "users" actor_user
      ON entry."actor_type" = 'user' AND actor_user."id" = entry."actor_id"
    LEFT JOIN "api_keys" actor_key
      ON entry."actor_type" = 'api_key' AND actor_key."id" = entry."actor_id"
   WHERE entry."workspace_id" = $1
     AND ($2::timestamptz IS NULL
          OR (entry."created_at", entry."id") < ($2::timestamptz, $3::uuid))
   ORDER BY entry."created_at" DESC, entry."id" DESC
   LIMIT $4`;

function toView(row: AuditRow): AuditLogEntryView {
  return {
    id: row.id,
    actor: { type: row.actor_type, id: row.actor_id, name: row.actor_name },
    action: row.action,
    target: { type: row.target_type, id: row.target_id },
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

/** Reads a workspace's audit log for its admins. */
@Injectable()
export class AuditLogReader {
  constructor(private readonly dataSource: DataSource) {}

  async readPage(
    workspaceId: string,
    query: AuditLogQuery,
  ): Promise<AuditLogPage> {
    const after =
      query.cursor === undefined ? null : decodeAuditCursor(query.cursor);
    // One extra row tells whether another page follows.
    const rows: AuditRow[] = await this.dataSource.query(PAGE_QUERY, [
      workspaceId,
      after?.createdAt ?? null,
      after?.id ?? null,
      query.limit + 1,
    ]);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toView),
      nextCursor:
        rows.length > query.limit && last !== undefined
          ? encodeAuditCursor({ createdAt: last.created_at_text, id: last.id })
          : null,
    };
  }
}

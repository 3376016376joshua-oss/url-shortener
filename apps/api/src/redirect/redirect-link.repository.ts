import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { StoredLinkStatus } from '../common/link/link-state.js';
import type { DomainStatus } from '../database/entities/domain.entity.js';
import type { CachedVariant } from '../link-cache/cache-entry.js';
import type { ResolvedLink } from './resolved-link.js';

/**
 * One round trip for everything a redirect needs. At most one row can match:
 * a unique index allows a host a single ACTIVE or BLOCKED domain. Variants
 * are the active ones, in order of creation, which is the order A/B
 * assignment lays them out in.
 */
const FIND_BY_HOST_AND_CODE = `
  SELECT
    d."id" AS "domainId",
    d."status" AS "domainStatus",
    l."id" AS "linkId",
    l."destination_url" AS "destinationUrl",
    l."status" AS "linkStatus",
    l."expires_at" AS "expiresAt",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', v."id",
            'destinationUrl', v."destination_url",
            'weight', v."weight"
          )
          ORDER BY v."created_at", v."id"
        )
        FROM "link_variants" v
        WHERE v."link_id" = l."id" AND v."archived_at" IS NULL
      ),
      '[]'::json
    ) AS "variants"
  FROM "domains" d
  LEFT JOIN "links" l ON l."domain_id" = d."id" AND l."code" = $2
  WHERE d."hostname" = $1 AND d."status" IN ('ACTIVE', 'BLOCKED')
`;

interface LookupRow {
  domainId: string;
  domainStatus: DomainStatus;
  linkId: string | null;
  destinationUrl: string;
  linkStatus: StoredLinkStatus;
  expiresAt: Date | null;
  variants: CachedVariant[];
}

/** The Postgres side of the redirect lookup: the source of truth. */
@Injectable()
export class RedirectLinkRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByHostAndCode(host: string, code: string): Promise<ResolvedLink> {
    const rows = await this.dataSource.query<LookupRow[]>(
      FIND_BY_HOST_AND_CODE,
      [host, code],
    );
    const row = rows[0];
    if (row === undefined) {
      return { domain: null, link: null };
    }
    const domain = { id: row.domainId, status: row.domainStatus };
    if (row.linkId === null) {
      return { domain, link: null };
    }
    return {
      domain,
      link: {
        id: row.linkId,
        domainId: row.domainId,
        destinationUrl: row.destinationUrl,
        status: row.linkStatus,
        expiresAt: row.expiresAt,
        variants: row.variants,
      },
    };
  }
}

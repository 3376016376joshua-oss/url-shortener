import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import {
  LinkStatus,
  type LinkListResponse,
  type ListLinksQuery,
} from '@url-shortener/contracts/links';
import { DataSource, type SelectQueryBuilder } from 'typeorm';
import { ApiException } from '../common/errors/api-exception.js';
import { StoredLinkStatus } from '../common/link/link-state.js';
import { Link } from '../database/entities/link.entity.js';
import { decodeLinkCursor, encodeLinkCursor } from './link-cursor.js';
import { LinkPresenter } from './link-presenter.js';

const CURSOR_CREATED_AT = 'cursor_created_at';

/** `created_at` as text with every microsecond, for the cursor. */
const CREATED_AT_TEXT = `to_char(link.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Makes a search term match literally inside a LIKE pattern. */
function toContainsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

function filterByStatus(
  query: SelectQueryBuilder<Link>,
  status: LinkStatus,
  now: Date,
): void {
  // Expiry is derived, so the two states stored as ACTIVE are told apart here.
  if (status === LinkStatus.Active || status === LinkStatus.Expired) {
    const expiry =
      status === LinkStatus.Expired
        ? 'link.expiresAt <= :now'
        : '(link.expiresAt IS NULL OR link.expiresAt > :now)';
    query
      .andWhere('link.status = :stored', { stored: StoredLinkStatus.Active })
      .andWhere(expiry, { now });
    return;
  }
  query.andWhere('link.status = :stored', { stored: status });
}

/** Lists a workspace's links, newest first (PRD section 14, LK-8). */
@Injectable()
export class LinkListService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly presenter: LinkPresenter,
  ) {}

  async list(
    workspaceId: string,
    filters: ListLinksQuery,
  ): Promise<LinkListResponse> {
    const query = this.dataSource
      .getRepository(Link)
      .createQueryBuilder('link')
      .addSelect(CREATED_AT_TEXT, CURSOR_CREATED_AT)
      .where('link.workspaceId = :workspaceId', { workspaceId })
      .orderBy('link.createdAt', 'DESC')
      .addOrderBy('link.id', 'DESC')
      // One more than asked for says whether another page exists.
      .limit(filters.limit + 1);
    this.applyFilters(query, filters);

    const { entities, raw } =
      await query.getRawAndEntities<Record<string, string>>();
    const page = entities.slice(0, filters.limit);
    const last = page.at(-1);
    const lastCreatedAt = raw[page.length - 1]?.[CURSOR_CREATED_AT];
    const hasMore = entities.length > filters.limit;

    return {
      items: await this.presenter.present(page),
      nextCursor:
        hasMore && last !== undefined && lastCreatedAt !== undefined
          ? encodeLinkCursor({ createdAt: lastCreatedAt, id: last.id })
          : null,
    };
  }

  private applyFilters(
    query: SelectQueryBuilder<Link>,
    filters: ListLinksQuery,
  ): void {
    if (filters.search !== undefined) {
      query.andWhere(
        `(link.code ILIKE :pattern OR link.title ILIKE :pattern
          OR link.destinationUrl ILIKE :pattern)`,
        { pattern: toContainsPattern(filters.search) },
      );
    }
    if (filters.status !== undefined) {
      filterByStatus(query, filters.status, new Date());
    }
    if (filters.domainId !== undefined) {
      query.andWhere('link.domainId = :domainId', {
        domainId: filters.domainId,
      });
    }
    if (filters.cursor !== undefined) {
      this.startAfter(query, filters.cursor);
    }
  }

  private startAfter(query: SelectQueryBuilder<Link>, encoded: string): void {
    const cursor = decodeLinkCursor(encoded);
    if (cursor === null) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'cursor: Not a cursor returned by this endpoint',
      );
    }
    query.andWhere(
      `(link.createdAt, link.id) <
        (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))`,
      { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id },
    );
  }
}

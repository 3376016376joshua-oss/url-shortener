import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LinkResponse } from '@url-shortener/contracts/links';
import { DataSource, In } from 'typeorm';
import { resolveLinkState } from '../common/link/link-state.js';
import type { Env } from '../config/env.schema.js';
import { Domain } from '../database/entities/domain.entity.js';
import { LinkVariant } from '../database/entities/link-variant.entity.js';
import type { Link } from '../database/entities/link.entity.js';

/** Turns link rows into the link resource of the API (PRD section 14). */
@Injectable()
export class LinkPresenter {
  /** Short URLs use the scheme and port of the app, on the link's domain. */
  private readonly appUrl: URL;

  constructor(
    config: ConfigService<Env, true>,
    private readonly dataSource: DataSource,
  ) {
    this.appUrl = new URL(config.get('APP_URL', { infer: true }));
  }

  async presentOne(link: Link): Promise<LinkResponse> {
    const [response] = await this.present([link]);
    if (response === undefined) {
      throw new Error(`Link ${link.id} could not be presented`);
    }
    return response;
  }

  /** Two queries for the whole page, however many links it holds. */
  async present(links: ReadonlyArray<Link>): Promise<LinkResponse[]> {
    if (links.length === 0) {
      return [];
    }
    const [hostnames, variantCounts] = await Promise.all([
      this.loadHostnames(links),
      this.countActiveVariants(links),
    ]);
    const now = new Date();
    return links.map((link) => {
      const hostname = hostnames.get(link.domainId);
      if (hostname === undefined) {
        // The foreign key forbids it; fail loudly rather than invent a URL.
        throw new Error(`Link ${link.id} has no domain`);
      }
      return this.toResponse(
        link,
        hostname,
        variantCounts.get(link.id) ?? 0,
        now,
      );
    });
  }

  private toResponse(
    link: Link,
    hostname: string,
    variantCount: number,
    now: Date,
  ): LinkResponse {
    return {
      id: link.id,
      domain: { id: link.domainId, hostname },
      code: link.code,
      shortUrl: this.shortUrl(hostname, link.code),
      destinationUrl: link.destinationUrl,
      title: link.title,
      status: resolveLinkState(link, now),
      expiresAt: link.expiresAt?.toISOString() ?? null,
      qrStyle: link.qrStyle,
      clickCount: Number(link.clickCount),
      variantCount,
      createdAt: link.createdAt.toISOString(),
      updatedAt: link.updatedAt.toISOString(),
    };
  }

  private shortUrl(hostname: string, code: string): string {
    const port = this.appUrl.port === '' ? '' : `:${this.appUrl.port}`;
    return `${this.appUrl.protocol}//${hostname}${port}/${code}`;
  }

  private async loadHostnames(
    links: ReadonlyArray<Link>,
  ): Promise<Map<string, string>> {
    const domainIds = [...new Set(links.map((link) => link.domainId))];
    const domains = await this.dataSource.getRepository(Domain).find({
      where: { id: In(domainIds) },
      select: { id: true, hostname: true },
    });
    return new Map(domains.map((domain) => [domain.id, domain.hostname]));
  }

  private async countActiveVariants(
    links: ReadonlyArray<Link>,
  ): Promise<Map<string, number>> {
    const rows = await this.dataSource
      .getRepository(LinkVariant)
      .createQueryBuilder('variant')
      .select('variant.linkId', 'linkId')
      .addSelect('count(*)', 'count')
      .where('variant.linkId IN (:...linkIds)', {
        linkIds: links.map((link) => link.id),
      })
      .andWhere('variant.archivedAt IS NULL')
      .groupBy('variant.linkId')
      .getRawMany<{ linkId: string; count: string }>();
    return new Map(rows.map((row) => [row.linkId, Number(row.count)]));
  }
}

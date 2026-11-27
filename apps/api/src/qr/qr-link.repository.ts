import { Injectable } from '@nestjs/common';
import type { QrStyle } from '@url-shortener/contracts/qr';
import { DataSource } from 'typeorm';
import { Domain } from '../database/entities/domain.entity.js';
import { Link } from '../database/entities/link.entity.js';

/** What a QR code needs to know about a link. */
export interface QrLink {
  hostname: string;
  code: string;
  /** `links.qr_style` as stored; `null` means the defaults. */
  qrStyle: unknown;
}

/** Reads and writes the QR side of a link, always scoped to its workspace. */
@Injectable()
export class QrLinkRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** The link, or `null` when the workspace has no such link. */
  async find(workspaceId: string, linkId: string): Promise<QrLink | null> {
    const link = await this.dataSource
      .getRepository(Link)
      .createQueryBuilder('link')
      .innerJoin(Domain, 'domain', 'domain.id = link.domainId')
      .select('domain.hostname', 'hostname')
      .addSelect('link.code', 'code')
      .addSelect('link.qrStyle', 'qrStyle')
      .where('link.id = :linkId', { linkId })
      .andWhere('link.workspaceId = :workspaceId', { workspaceId })
      .getRawOne<QrLink>();
    return link ?? null;
  }

  /** Stores the style, or clears it with `null`. False when the workspace has no such link. */
  async saveStyle(
    workspaceId: string,
    linkId: string,
    style: QrStyle | null,
  ): Promise<boolean> {
    const result = await this.dataSource
      .getRepository(Link)
      .update({ id: linkId, workspaceId }, { qrStyle: style });
    return result.affected === 1;
  }
}

import { createHash } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@url-shortener/contracts';
import {
  findQrStyleIssue,
  type QrRenderQuery,
  type QrStyle,
} from '@url-shortener/contracts/qr';
import { AuditLog, type AuditEntry } from '../audit/audit-log.js';
import { ApiException } from '../common/errors/api-exception.js';
import { createValidationException } from '../common/errors/validation-exception.factory.js';
import { CounterName, Metrics } from '../common/metrics/metrics.js';
import type { Env } from '../config/env.schema.js';
import { buildQrContent, buildShortUrl } from './qr-content.js';
import { QrLinkRepository } from './qr-link.repository.js';
import { QR_CONTENT_TYPE, renderQr } from './qr-renderer.js';
import {
  isDefaultStyle,
  parseSavedStyle,
  resolveRenderOptions,
} from './qr-style.js';

const QR_STYLE_UPDATED_ACTION = 'link.qr_style_updated';
const LINK_TARGET_TYPE = 'link';

export interface QrImage {
  contentType: string;
  body: Buffer;
  /** A strong validator: equal exactly when the bytes are. */
  etag: string;
}

function linkNotFound(): ApiException {
  return new ApiException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NotFound,
    'Link not found',
  );
}

function strongEtag(body: Buffer): string {
  return `"${createHash('sha256').update(body).digest('base64url')}"`;
}

/** QR codes for links: rendering and saved styles (PRD section 9). */
@Injectable()
export class QrService {
  private readonly logger = new Logger(QrService.name);

  constructor(
    private readonly links: QrLinkRepository,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditLog,
    private readonly metrics: Metrics,
  ) {}

  /** The link's QR code, in its saved style with the query's overrides. */
  async render(
    workspaceId: string,
    linkId: string,
    query: QrRenderQuery,
  ): Promise<QrImage> {
    const link = await this.links.find(workspaceId, linkId);
    if (link === null) {
      throw linkNotFound();
    }

    const saved = parseSavedStyle(link.qrStyle);
    if (saved === null && link.qrStyle !== null) {
      // Only this module writes the column, so this means a bug or a manual
      // edit. The code must still render, so it falls back to the defaults.
      this.logger.warn(
        `Link ${linkId} has an unreadable saved QR style; rendering with the defaults`,
      );
    }
    const options = resolveRenderOptions(saved, query);
    // Each half was valid by itself; the saved style and the overrides
    // together may still be a pair that does not scan.
    const issue = findQrStyleIssue(options);
    if (issue !== null) {
      throw createValidationException([{ message: issue }]);
    }

    const shortUrl = buildShortUrl(
      this.config.get('APP_URL', { infer: true }),
      link.hostname,
      link.code,
    );
    const body = await renderQr(buildQrContent(shortUrl), options);
    this.metrics.incrementCounter(CounterName.QrCodesRendered, {
      format: options.format,
    });
    return {
      contentType: QR_CONTENT_TYPE[options.format],
      body,
      etag: strongEtag(body),
    };
  }

  /** Replaces the link's saved style and returns what later renders will use. */
  async saveStyle(
    workspaceId: string,
    linkId: string,
    style: QrStyle,
    actor: AuditEntry['actor'],
  ): Promise<QrStyle> {
    const saved = await this.links.saveStyle(
      workspaceId,
      linkId,
      isDefaultStyle(style) ? null : style,
    );
    if (!saved) {
      throw linkNotFound();
    }
    await this.audit.record({
      workspaceId,
      actor,
      action: QR_STYLE_UPDATED_ACTION,
      target: { type: LINK_TARGET_TYPE, id: linkId },
      metadata: { ...style },
    });
    return style;
  }
}

import { Controller, Get, HttpStatus, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiException } from '../common/errors/api-exception.js';
import { ClickSource } from '../database/entities/click-event.entity.js';
import {
  ERROR_PAGE_CONTENT_SECURITY_POLICY,
  renderErrorPage,
} from './error-page.js';
import { describeFailure } from './redirect-failure.js';
import { RedirectService, type RedirectVisit } from './redirect.service.js';
import { normaliseHost } from './request-host.js';

/** The value of `?r=` a QR code adds to its short URL (PRD section 9). */
const QR_SCAN_MARKER = 'qr';

function toVisit(code: string, request: Request): RedirectVisit {
  return {
    host: normaliseHost(request.hostname),
    code,
    source:
      request.query['r'] === QR_SCAN_MARKER ? ClickSource.Qr : ClickSource.Link,
    ip: request.ip ?? '',
    userAgent: request.get('user-agent') ?? null,
    referrer: request.get('referer') ?? null,
  };
}

/**
 * A browser lists `text/html` in `Accept`; programs send nothing or a
 * wildcard, and get JSON because it is listed first here.
 */
function prefersHtml(request: Request): boolean {
  return request.accepts(['json', 'html']) === 'html';
}

/** `GET /{code}` on every short domain. Registered last: it matches any single-segment path. */
@Controller()
export class RedirectController {
  constructor(private readonly redirects: RedirectService) {}

  @Get(':code')
  async follow(
    @Param('code') code: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    // Every answer depends on state that can change at any moment, the
    // failures included: a missing code may be created a second later.
    response.setHeader('Cache-Control', 'no-store');

    const result = await this.redirects.follow(toVisit(code, request));
    if (result.outcome === 'found') {
      // 302, never 301: a browser must come back for every click.
      response.redirect(HttpStatus.FOUND, result.location);
      return;
    }

    const failure = describeFailure(result);
    if (!prefersHtml(request)) {
      throw new ApiException(failure.status, failure.code, failure.message);
    }
    response
      .status(failure.status)
      .setHeader('Content-Security-Policy', ERROR_PAGE_CONTENT_SECURITY_POLICY)
      .setHeader('X-Content-Type-Options', 'nosniff')
      .type('html')
      .send(renderErrorPage(failure));
  }
}

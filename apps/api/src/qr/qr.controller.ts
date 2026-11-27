import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  qrRenderQuerySchema,
  qrStyleInputSchema,
  type QrRenderQuery,
  type QrStyle,
} from '@url-shortener/contracts/qr';
import type { Response } from 'express';
import { z } from 'zod';
import { WorkspaceRole } from '../database/entities/workspace-member.entity.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal } from '../identity/current-principal.decorator.js';
import type { Principal } from '../identity/principal.js';
import { requireWorkspaceRole } from '../identity/workspace-access.js';
import { toAuditActor } from './audit-actor.js';
import { QrService } from './qr.service.js';

/** The image is specific to a signed-in caller, and a style change shows within minutes. */
const QR_CACHE_CONTROL = 'private, max-age=300';

const linkPathSchema = z.strictObject({
  workspaceId: z.uuid(),
  linkId: z.uuid(),
});
type LinkPath = z.infer<typeof linkPathSchema>;

@Controller('api/v1/workspaces/:workspaceId/links/:linkId')
@UseGuards(AuthGuard)
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get('qr')
  async render(
    @CurrentPrincipal() principal: Principal,
    @Param({ schema: linkPathSchema }) path: LinkPath,
    @Query({ schema: qrRenderQuerySchema }) query: QrRenderQuery,
    @Res() response: Response,
  ): Promise<void> {
    requireWorkspaceRole(principal, path.workspaceId, WorkspaceRole.Member);
    const image = await this.qr.render(path.workspaceId, path.linkId, query);
    // Express answers 304 by itself when If-None-Match matches this ETag.
    response
      .set({
        'Content-Type': image.contentType,
        'Cache-Control': QR_CACHE_CONTROL,
        ETag: image.etag,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image.body);
  }

  @Put('qr-style')
  saveStyle(
    @CurrentPrincipal() principal: Principal,
    @Param({ schema: linkPathSchema }) path: LinkPath,
    @Body({ schema: qrStyleInputSchema }) style: QrStyle,
  ): Promise<QrStyle> {
    requireWorkspaceRole(principal, path.workspaceId, WorkspaceRole.Member);
    return this.qr.saveStyle(
      path.workspaceId,
      path.linkId,
      style,
      toAuditActor(principal),
    );
  }
}

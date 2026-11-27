import { Module } from '@nestjs/common';
import { QrLinkRepository } from './qr-link.repository.js';
import { QrController } from './qr.controller.js';
import { QrService } from './qr.service.js';

/** QR code rendering and saved styles (PRD section 9). */
@Module({
  controllers: [QrController],
  providers: [QrService, QrLinkRepository],
})
export class QrModule {}

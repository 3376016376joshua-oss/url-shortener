import { QrFormat } from '@url-shortener/contracts/qr';
import QRCode from 'qrcode';
import type { QrRenderOptions } from './qr-style.js';

export const QR_CONTENT_TYPE: Readonly<Record<QrFormat, string>> = {
  [QrFormat.Svg]: 'image/svg+xml',
  [QrFormat.Png]: 'image/png',
};

/**
 * Draws `content` as a QR code. The same content and options always produce
 * the same bytes, which is what makes the response's ETag meaningful.
 */
export async function renderQr(
  content: string,
  options: QrRenderOptions,
): Promise<Buffer> {
  const common = {
    errorCorrectionLevel: options.errorCorrection,
    margin: options.margin,
    color: {
      dark: `#${options.foreground}`,
      light: `#${options.background}`,
    },
  };
  if (options.format === QrFormat.Png) {
    return QRCode.toBuffer(content, {
      ...common,
      type: 'png',
      width: options.size,
    });
  }
  // No width: the SVG carries only a viewBox, so it scales to any size.
  const svg = await QRCode.toString(content, { ...common, type: 'svg' });
  return Buffer.from(svg, 'utf8');
}

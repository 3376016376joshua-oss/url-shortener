import {
  DEFAULT_QR_FORMAT,
  DEFAULT_QR_SIZE,
  DEFAULT_QR_STYLE,
  qrStyleSchema,
  type QrFormat,
  type QrRenderQuery,
  type QrStyle,
} from '@url-shortener/contracts/qr';

/** Everything the renderer needs to draw one image. */
export interface QrRenderOptions extends QrStyle {
  format: QrFormat;
  /** Width and height in pixels. Used for PNG only. */
  size: number;
}

/** The saved style read back from `links.qr_style`, or `null` when it is not a style. */
export function parseSavedStyle(stored: unknown): QrStyle | null {
  const parsed = qrStyleSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** A style equal to the defaults is not worth storing: `null` already means it. */
export function isDefaultStyle(style: QrStyle): boolean {
  return (
    style.foreground === DEFAULT_QR_STYLE.foreground &&
    style.background === DEFAULT_QR_STYLE.background &&
    style.margin === DEFAULT_QR_STYLE.margin &&
    style.errorCorrection === DEFAULT_QR_STYLE.errorCorrection
  );
}

/**
 * One request's rendering: the link's saved style, or the defaults without
 * one, with each query parameter overriding its option.
 */
export function resolveRenderOptions(
  saved: QrStyle | null,
  query: QrRenderQuery,
): QrRenderOptions {
  const base = saved ?? DEFAULT_QR_STYLE;
  return {
    format: query.format ?? DEFAULT_QR_FORMAT,
    size: query.size ?? DEFAULT_QR_SIZE,
    foreground: query.foreground ?? base.foreground,
    background: query.background ?? base.background,
    margin: query.margin ?? base.margin,
    errorCorrection: query.errorCorrection ?? base.errorCorrection,
  };
}

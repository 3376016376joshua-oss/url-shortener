import { z } from 'zod';

/**
 * The query parameter a QR code adds to the short URL it encodes, so the
 * redirect can tell a scan from an ordinary click: `https://host/code?r=qr`.
 */
export const QR_SCAN_MARKER_PARAM = 'r';
export const QR_SCAN_MARKER_VALUE = 'qr';

export const QrFormat = { Svg: 'svg', Png: 'png' } as const;
export type QrFormat = (typeof QrFormat)[keyof typeof QrFormat];

/** How much of the code may be damaged and still scan: L 7%, M 15%, Q 25%, H 30%. */
export const QrErrorCorrection = { L: 'L', M: 'M', Q: 'Q', H: 'H' } as const;
export type QrErrorCorrection =
  (typeof QrErrorCorrection)[keyof typeof QrErrorCorrection];

export const QR_SIZE_MIN = 128;
export const QR_SIZE_MAX = 2048;
export const QR_MARGIN_MIN = 0;
export const QR_MARGIN_MAX = 16;
/** Below this WCAG contrast ratio a scanner cannot reliably tell the modules apart. */
export const QR_MIN_CONTRAST_RATIO = 3;

export const DEFAULT_QR_FORMAT: QrFormat = QrFormat.Svg;
export const DEFAULT_QR_SIZE = 512;
/** What a link without a saved style renders with. */
export const DEFAULT_QR_STYLE = {
  foreground: '000000',
  background: 'ffffff',
  margin: 4,
  errorCorrection: QrErrorCorrection.M,
} as const;

const HEX_COLOUR = /^[0-9a-f]{6}$/i;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;

const LOW_CONTRAST_MESSAGE = `foreground and background need a contrast ratio of at least ${QR_MIN_CONTRAST_RATIO}:1 to scan reliably`;

const hexColour = z
  .string()
  .regex(HEX_COLOUR, 'must be a 6-digit hex colour, for example 1a2b3c')
  .transform((value) => value.toLowerCase());

const margin = z.number().int().min(QR_MARGIN_MIN).max(QR_MARGIN_MAX);
const errorCorrection = z.enum(QrErrorCorrection);

/** A whole number from a query string, where every value arrives as text. */
const integerText = z
  .string()
  .regex(/^\d{1,9}$/, 'must be a whole number')
  .transform(Number);

/** The sRGB transfer function and channel weights of WCAG 2.1 relative luminance. */
const SRGB_LINEAR_THRESHOLD = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA = 2.4;
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
/** WCAG adds this to both luminances so that black does not divide by zero. */
const CONTRAST_FLARE = 0.05;

/** WCAG 2.1 relative luminance of a 6-digit hex colour, from 0 (black) to 1 (white). */
function relativeLuminance(hex: string): number {
  return LUMINANCE_WEIGHTS.reduce((luminance, weight, index) => {
    const value =
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), HEX_RADIX) /
      CHANNEL_MAX;
    const linear =
      value <= SRGB_LINEAR_THRESHOLD
        ? value / SRGB_LINEAR_DIVISOR
        : ((value + SRGB_GAMMA_OFFSET) / (1 + SRGB_GAMMA_OFFSET)) ** SRGB_GAMMA;
    return luminance + weight * linear;
  }, 0);
}

/** WCAG 2.1 contrast ratio of two 6-digit hex colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const luminances = [relativeLuminance(first), relativeLuminance(second)];
  const lighter = Math.max(...luminances);
  const darker = Math.min(...luminances);
  return (lighter + CONTRAST_FLARE) / (darker + CONTRAST_FLARE);
}

interface ColourPair {
  foreground: string;
  background: string;
}

const hasScannableContrast = ({ foreground, background }: ColourPair) =>
  contrastRatio(foreground, background) >= QR_MIN_CONTRAST_RATIO;

/**
 * Refuses a style that would not scan reliably. For a style assembled outside
 * `qrStyleInputSchema`, such as a saved style with per-request overrides.
 */
export function findQrStyleIssue(style: ColourPair): string | null {
  return hasScannableContrast(style) ? null : LOW_CONTRAST_MESSAGE;
}

/** A link's QR styling: the `qrStyle` of a link, and the answer to saving one. */
export const qrStyleSchema = z.strictObject({
  foreground: hexColour,
  background: hexColour,
  margin,
  errorCorrection,
});
export type QrStyle = z.infer<typeof qrStyleSchema>;

/**
 * Body of `PUT .../links/{linkId}/qr-style`. It replaces the saved style:
 * an option left out goes back to its default.
 */
export const qrStyleInputSchema = z
  .strictObject({
    foreground: hexColour.default(DEFAULT_QR_STYLE.foreground),
    background: hexColour.default(DEFAULT_QR_STYLE.background),
    margin: margin.default(DEFAULT_QR_STYLE.margin),
    errorCorrection: errorCorrection.default(DEFAULT_QR_STYLE.errorCorrection),
  })
  .refine(hasScannableContrast, {
    message: LOW_CONTRAST_MESSAGE,
    path: ['foreground'],
  });
export type QrStyleInput = z.input<typeof qrStyleInputSchema>;

/**
 * Query of `GET .../links/{linkId}/qr`. Each styling option overrides the
 * link's saved style for this one request.
 */
export const qrRenderQuerySchema = z.strictObject({
  format: z.enum(QrFormat).optional(),
  /** Width and height in pixels. PNG only; an SVG scales freely. */
  size: integerText
    .pipe(z.number().min(QR_SIZE_MIN).max(QR_SIZE_MAX))
    .optional(),
  margin: integerText.pipe(margin).optional(),
  foreground: hexColour.optional(),
  background: hexColour.optional(),
  errorCorrection: errorCorrection.optional(),
});
export type QrRenderQueryInput = z.input<typeof qrRenderQuerySchema>;
export type QrRenderQuery = z.infer<typeof qrRenderQuerySchema>;

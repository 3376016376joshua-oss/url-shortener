import jsQrModule from 'jsqr';
import { PNG } from 'pngjs';

// jsqr is CommonJS that declares a default export, so under Node's ESM
// rules the function is one level down.
const jsQR = jsQrModule.default;

const RGBA_CHANNELS = 4;
const OPAQUE = 255;
/** Pixels drawn per SVG module: enough for a scanner to resolve each one. */
const PIXELS_PER_MODULE = 6;

type Rgb = readonly [number, number, number];

export interface DecodedImage {
  /** What a scanner reads from the code; `null` when it cannot read one. */
  content: string | null;
  width: number;
  height: number;
}

function scan(pixels: Uint8ClampedArray, width: number, height: number) {
  // Only what a phone camera would accept: dark modules on a light ground.
  const result = jsQR(pixels, width, height, {
    inversionAttempts: 'dontInvert',
  });
  return result?.data ?? null;
}

/** Decodes a PNG the way a scanner would, and reports its pixel size. */
export function decodePng(body: Buffer): DecodedImage {
  const { data, width, height } = PNG.sync.read(body);
  return {
    content: scan(new Uint8ClampedArray(data), width, height),
    width,
    height,
  };
}

function parseColour(svg: string, attribute: 'fill' | 'stroke'): Rgb {
  const match = new RegExp(`${attribute}="#([0-9a-f]{6})"`).exec(svg);
  if (match?.[1] === undefined) {
    throw new Error(`The SVG has no ${attribute} colour`);
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & OPAQUE, (value >> 8) & OPAQUE, value & OPAQUE];
}

/**
 * The dark runs of the code, as `[column, row, length]` in module units.
 * The renderer draws each row as a stroked path: `M x y` starts a row, `h n`
 * draws a run, and `m dx 0` skips the light modules up to the next run.
 */
function parseRuns(svg: string): Array<[number, number, number]> {
  const path = /<path stroke="[^"]*" d="([^"]*)"/.exec(svg)?.[1];
  if (path === undefined) {
    throw new Error('The SVG has no stroked path');
  }
  const runs: Array<[number, number, number]> = [];
  let column = 0;
  let row = 0;
  for (const [, command, first, second] of path.matchAll(
    /([Mmh])(-?[\d.]+)(?: (-?[\d.]+))?/g,
  )) {
    const value = Number(first);
    if (command === 'M') {
      column = value;
      row = Math.floor(Number(second));
    } else if (command === 'm') {
      column += value;
    } else {
      runs.push([column, row, value]);
      column += value;
    }
  }
  return runs;
}

/**
 * Rasterises an SVG produced by the QR endpoint, in its own colours, and
 * decodes it the way a scanner would. `width` and `height` are in modules,
 * quiet zone included.
 */
export function decodeSvg(svg: string): DecodedImage {
  const modules = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  if (!Number.isInteger(modules)) {
    throw new Error('The SVG has no square viewBox');
  }
  const background = parseColour(svg, 'fill');
  const foreground = parseColour(svg, 'stroke');
  const side = modules * PIXELS_PER_MODULE;
  const pixels = new Uint8ClampedArray(side * side * RGBA_CHANNELS);
  const paint = (x: number, y: number, [red, green, blue]: Rgb): void => {
    pixels.set([red, green, blue, OPAQUE], (y * side + x) * RGBA_CHANNELS);
  };

  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      paint(x, y, background);
    }
  }
  for (const [column, row, length] of parseRuns(svg)) {
    for (
      let y = row * PIXELS_PER_MODULE;
      y < (row + 1) * PIXELS_PER_MODULE;
      y += 1
    ) {
      for (
        let x = column * PIXELS_PER_MODULE;
        x < (column + length) * PIXELS_PER_MODULE;
        x += 1
      ) {
        paint(x, y, foreground);
      }
    }
  }
  return { content: scan(pixels, side, side), width: modules, height: modules };
}

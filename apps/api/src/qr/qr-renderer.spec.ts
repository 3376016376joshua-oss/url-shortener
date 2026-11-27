import { describe, expect, it } from 'vitest';
import { QR_CONTENT_TYPE, renderQr } from './qr-renderer.js';
import type { QrRenderOptions } from './qr-style.js';

const CONTENT = 'https://sho.test/abc1234?r=qr';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** Where a PNG states its width and height, as big-endian 32-bit integers. */
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;

const OPTIONS: QrRenderOptions = {
  format: 'svg',
  size: 512,
  foreground: '000000',
  background: 'ffffff',
  margin: 4,
  errorCorrection: 'M',
};

const viewBoxSide = (svg: Buffer): number =>
  Number(/viewBox="0 0 (\d+) \d+"/.exec(svg.toString('utf8'))?.[1]);

describe('renderQr', () => {
  it('names a content type for each format', () => {
    expect(QR_CONTENT_TYPE).toEqual({
      svg: 'image/svg+xml',
      png: 'image/png',
    });
  });

  it('draws an SVG in the given colours that scales freely', async () => {
    const svg = (
      await renderQr(CONTENT, {
        ...OPTIONS,
        foreground: '1a3c8f',
        background: 'fff8e7',
      })
    ).toString('utf8');

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('stroke="#1a3c8f"');
    expect(svg).toContain('fill="#fff8e7"');
    expect(svg).not.toMatch(/<svg[^>]* width=/);
  });

  it('ignores the size for an SVG', async () => {
    const small = await renderQr(CONTENT, { ...OPTIONS, size: 128 });
    const large = await renderQr(CONTENT, { ...OPTIONS, size: 2048 });

    expect(small.equals(large)).toBe(true);
  });

  it.each([128, 300, 512, 2048])(
    'draws a PNG exactly %i pixels square',
    async (size) => {
      const png = await renderQr(CONTENT, { ...OPTIONS, format: 'png', size });

      expect(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(
        true,
      );
      expect(png.readUInt32BE(PNG_WIDTH_OFFSET)).toBe(size);
      expect(png.readUInt32BE(PNG_HEIGHT_OFFSET)).toBe(size);
    },
  );

  it('adds the margin on every side, in modules', async () => {
    const tight = await renderQr(CONTENT, { ...OPTIONS, margin: 0 });
    const roomy = await renderQr(CONTENT, { ...OPTIONS, margin: 16 });

    expect(viewBoxSide(roomy) - viewBoxSide(tight)).toBe(2 * 16);
  });

  it('spends more modules on a higher error correction level', async () => {
    const low = await renderQr(CONTENT, { ...OPTIONS, errorCorrection: 'L' });
    const high = await renderQr(CONTENT, { ...OPTIONS, errorCorrection: 'H' });

    expect(viewBoxSide(high)).toBeGreaterThan(viewBoxSide(low));
  });

  it.each(['svg', 'png'] as const)(
    'produces the same %s bytes every time',
    async (format) => {
      const first = await renderQr(CONTENT, { ...OPTIONS, format });
      const second = await renderQr(CONTENT, { ...OPTIONS, format });

      expect(first.equals(second)).toBe(true);
    },
  );
});

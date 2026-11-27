import { describe, expect, it } from 'vitest';
import { buildQrContent, buildShortUrl } from './qr-content.js';

describe('buildShortUrl', () => {
  it('uses the scheme of the app URL', () => {
    expect(buildShortUrl('https://app.sho.rt', 'go.brand.com', 'launch')).toBe(
      'https://go.brand.com/launch',
    );
  });

  it('carries a non-default port of the app URL', () => {
    expect(
      buildShortUrl('http://localhost:8080', 'sho.localhost', 'aB3_-x'),
    ).toBe('http://sho.localhost:8080/aB3_-x');
  });

  it('drops a default port', () => {
    expect(buildShortUrl('https://app.sho.rt:443', 'sho.rt', 'abc1234')).toBe(
      'https://sho.rt/abc1234',
    );
  });
});

describe('buildQrContent', () => {
  it('adds the scan marker to the short URL', () => {
    expect(buildQrContent('https://go.brand.com/launch')).toBe(
      'https://go.brand.com/launch?r=qr',
    );
  });
});

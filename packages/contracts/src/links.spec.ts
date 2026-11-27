import { describe, expect, it } from 'vitest';
import {
  DESTINATION_URL_MAX_LENGTH,
  createLinkRequestSchema,
  createVariantRequestSchema,
  destinationUrlSchema,
  listLinksQuerySchema,
  updateLinkRequestSchema,
  updateVariantRequestSchema,
} from './links.js';

const DESTINATION = 'https://example.com/landing';

describe('destinationUrlSchema', () => {
  it.each([
    ['HTTPS://Example.COM', 'https://example.com/'],
    ['http://example.com:80/a/../b', 'http://example.com/b'],
    ['https://example.com/a b?q=ü', 'https://example.com/a%20b?q=%C3%BC'],
    ['https://bücher.example/', 'https://xn--bcher-kva.example/'],
  ])('normalises %s', (input, normalised) => {
    expect(destinationUrlSchema.parse(input)).toBe(normalised);
  });

  it.each([
    'ftp://example.com/file',
    'javascript:alert(1)',
    'mailto:someone@example.com',
    '/relative/path',
    'example.com',
    'http:example.com',
    'https:/example.com',
    'https://',
    '',
  ])('rejects %s', (input) => {
    expect(destinationUrlSchema.safeParse(input).success).toBe(false);
  });

  it('accepts a URL of exactly the maximum length', () => {
    const prefix = 'https://example.com/';
    const url = prefix + 'a'.repeat(DESTINATION_URL_MAX_LENGTH - prefix.length);

    expect(destinationUrlSchema.parse(url)).toHaveLength(
      DESTINATION_URL_MAX_LENGTH,
    );
  });

  it('rejects a URL that is too long once normalised', () => {
    const prefix = 'https://example.com/';
    const spaces = ' '.repeat(DESTINATION_URL_MAX_LENGTH / 2);

    expect(destinationUrlSchema.safeParse(`${prefix}a${spaces}a`).success).toBe(
      false,
    );
  });
});

describe('createLinkRequestSchema', () => {
  it('needs only a destination', () => {
    expect(
      createLinkRequestSchema.parse({ destinationUrl: DESTINATION }),
    ).toEqual({ destinationUrl: DESTINATION });
  });

  it('rejects an unknown property', () => {
    const result = createLinkRequestSchema.safeParse({
      destinationUrl: DESTINATION,
      clickCount: 5,
    });

    expect(result.success).toBe(false);
  });

  it.each(['ab', 'a'.repeat(33), 'has space', 'slash/code', 'dot.code'])(
    'rejects the code %s',
    (code) => {
      const result = createLinkRequestSchema.safeParse({
        destinationUrl: DESTINATION,
        code,
      });

      expect(result.success).toBe(false);
    },
  );

  it.each(['abc', 'a'.repeat(32), 'Spring_launch-26'])(
    'accepts the code %s',
    (code) => {
      const result = createLinkRequestSchema.safeParse({
        destinationUrl: DESTINATION,
        code,
      });

      expect(result.success).toBe(true);
    },
  );

  it('trims the title and rejects an empty one', () => {
    const parse = (title: string) =>
      createLinkRequestSchema.safeParse({ destinationUrl: DESTINATION, title });

    expect(parse('  Spring launch ').data?.title).toBe('Spring launch');
    expect(parse('   ').success).toBe(false);
  });

  it('rejects an expiry that is not an ISO 8601 timestamp', () => {
    const result = createLinkRequestSchema.safeParse({
      destinationUrl: DESTINATION,
      expiresAt: 'tomorrow',
    });

    expect(result.success).toBe(false);
  });
});

describe('updateLinkRequestSchema', () => {
  it('requires at least one field', () => {
    expect(updateLinkRequestSchema.safeParse({}).success).toBe(false);
  });

  it('lets null clear the title and the expiry', () => {
    expect(
      updateLinkRequestSchema.parse({ title: null, expiresAt: null }),
    ).toEqual({ title: null, expiresAt: null });
  });

  it.each(['BLOCKED', 'EXPIRED', 'active'])(
    'refuses the status %s',
    (status) => {
      expect(updateLinkRequestSchema.safeParse({ status }).success).toBe(false);
    },
  );

  it('refuses to change the code or the domain', () => {
    expect(updateLinkRequestSchema.safeParse({ code: 'other' }).success).toBe(
      false,
    );
  });
});

describe('listLinksQuerySchema', () => {
  it('defaults the limit and coerces it from the query string', () => {
    expect(listLinksQuerySchema.parse({}).limit).toBe(25);
    expect(listLinksQuerySchema.parse({ limit: '60' }).limit).toBe(60);
  });

  it('treats an empty search as no search', () => {
    expect(listLinksQuerySchema.parse({ search: '  ' }).search).toBeUndefined();
    expect(listLinksQuerySchema.parse({ search: ' go ' }).search).toBe('go');
  });

  it.each(['0', '101', '2.5', 'many'])('rejects the limit %s', (limit) => {
    expect(listLinksQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});

describe('variant request schemas', () => {
  const variant = { name: 'B', destinationUrl: DESTINATION, weight: 30 };

  it.each([0, 100, 1.5])('rejects the weight %s', (weight) => {
    const result = createVariantRequestSchema.safeParse({ ...variant, weight });

    expect(result.success).toBe(false);
  });

  it('accepts the smallest and the largest weight', () => {
    for (const weight of [1, 99]) {
      const result = createVariantRequestSchema.safeParse({
        ...variant,
        weight,
      });

      expect(result.success).toBe(true);
    }
  });

  it('requires at least one field in an update', () => {
    expect(updateVariantRequestSchema.safeParse({}).success).toBe(false);
    expect(updateVariantRequestSchema.safeParse({ weight: 10 }).success).toBe(
      true,
    );
  });
});

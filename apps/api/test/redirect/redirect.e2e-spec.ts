import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  ClickRecorder,
  type ClickInput,
} from '../../src/analytics/click-recorder.js';
import { StoredLinkStatus } from '../../src/common/link/link-state.js';
import { DomainStatus } from '../../src/database/entities/domain.entity.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  BROWSER_ACCEPT,
  PLATFORM_HOST,
  createDomain,
  createLink,
  follow,
} from './redirect-fixtures.js';

const HOUR_MS = 3_600_000;
const fromNow = (ms: number): Date => new Date(Date.now() + ms);

describe('GET /{code}', () => {
  let app: NestExpressApplication;
  let tenant: WorkspaceFixture;
  const record = vi.fn<(click: ClickInput) => void>();

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ClickRecorder).useValue({ record }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetState(app);
    record.mockReset();
    tenant = await createWorkspaceFixture(app);
  });

  const link = (overrides: Parameters<typeof createLink>[3] = {}) =>
    createLink(app, tenant.domain, tenant.workspace.id, overrides);

  describe('an active link', () => {
    it('answers 302, never 301, to the destination with Cache-Control: no-store', async () => {
      const { code } = await link({
        destinationUrl: 'https://example.com/landing?utm=a&x=%20y#top',
      });

      const response = await follow(app, code);

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe(
        'https://example.com/landing?utm=a&x=%20y#top',
      );
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('sets no cookie', async () => {
      const { code } = await link();

      const response = await follow(app, code);

      expect(response.headers).not.toHaveProperty('set-cookie');
    });

    it('matches the host without its port and in any case', async () => {
      const { code } = await link();

      const response = await follow(app, code, 'SHO.Test:8443');

      expect(response.status).toBe(302);
    });

    it('does not forward query parameters to the destination', async () => {
      const { code } = await link({ destinationUrl: 'https://example.com/a' });

      const response = await follow(app, `${code}?utm_source=mail&r=qr`);

      expect(response.headers['location']).toBe('https://example.com/a');
    });

    it('answers HEAD like GET', async () => {
      const { code, destinationUrl } = await link();

      const response = await request(app.getHttpServer())
        .head(`/${code}`)
        .set('Host', PLATFORM_HOST);

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe(destinationUrl);
    });

    it('keeps codes case-sensitive', async () => {
      await link({ code: 'Launch' });

      expect((await follow(app, 'Launch')).status).toBe(302);
      expect((await follow(app, 'launch')).status).toBe(404);
    });

    it('still redirects before its expiry', async () => {
      const { code } = await link({ expiresAt: fromNow(HOUR_MS) });

      expect((await follow(app, code)).status).toBe(302);
    });
  });

  describe('404', () => {
    const NOT_FOUND_BODY = {
      statusCode: 404,
      error: 'Not Found',
      code: 'LINK_NOT_FOUND',
      message: 'Short link not found',
    };

    it.each([
      ['an unknown code', 'nosuch1'],
      ['a code that is too short', 'ab'],
      ['a code that is too long', 'a'.repeat(33)],
      ['a code with characters no code can have', 'favicon.ico'],
      ['a reserved word', 'login'],
    ])('answers %s with LINK_NOT_FOUND', async (_reason, code) => {
      const response = await follow(app, code);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it.each([
      ['a host no domain serves', 'unknown.example'],
      ['a host that is not a host name', 'not_a_host!'],
    ])('answers a known code on %s', async (_reason, host) => {
      const { code } = await link();

      const response = await follow(app, code, host);

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND_BODY);
    });

    it.each([
      DomainStatus.Pending,
      DomainStatus.Inactive,
      DomainStatus.Blocked,
    ])('answers a link on a %s domain', async (status) => {
      const domain = await createDomain(
        app,
        tenant.workspace.id,
        'go.brand.test',
        status,
      );
      const { code } = await createLink(app, domain, tenant.workspace.id);

      const response = await follow(app, code, 'go.brand.test');

      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND_BODY);
    });
  });

  describe('410', () => {
    it.each([StoredLinkStatus.Disabled, StoredLinkStatus.Blocked])(
      'answers a %s link with LINK_DISABLED',
      async (status) => {
        const { code } = await link({ status });

        const response = await follow(app, code);

        expect(response.status).toBe(410);
        expect(response.body).toEqual({
          statusCode: 410,
          error: 'Gone',
          code: 'LINK_DISABLED',
          message: 'This link has been disabled',
        });
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('answers an expired link with LINK_EXPIRED', async () => {
      const { code } = await link({ expiresAt: fromNow(-1_000) });

      const response = await follow(app, code);

      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        statusCode: 410,
        error: 'Gone',
        code: 'LINK_EXPIRED',
        message: 'This link has expired',
      });
    });

    it('lets a stored status win over expiry', async () => {
      const { code } = await link({
        status: StoredLinkStatus.Disabled,
        expiresAt: fromNow(-1_000),
      });

      const response = await follow(app, code);

      expect(response.body).toMatchObject({ code: 'LINK_DISABLED' });
    });
  });

  describe('domains as namespaces', () => {
    it("sends the same code on two domains to each domain's own destination", async () => {
      const brand = await createDomain(
        app,
        tenant.workspace.id,
        'go.brand.test',
      );
      await link({ code: 'launch', destinationUrl: 'https://example.com/a' });
      await createLink(app, brand, tenant.workspace.id, {
        code: 'launch',
        destinationUrl: 'https://example.com/b',
      });

      const onPlatform = await follow(app, 'launch');
      const onBrand = await follow(app, 'launch', 'go.brand.test');
      const onThird = await follow(app, 'launch', 'go.other.test');

      expect(onPlatform.headers['location']).toBe('https://example.com/a');
      expect(onBrand.headers['location']).toBe('https://example.com/b');
      expect(onThird.status).toBe(404);
    });
  });

  describe('error pages', () => {
    it.each([
      ['an unknown code', {}, 'nosuch1', 404, 'Link not found'],
      [
        'an expired link',
        { code: 'expired', expiresAt: fromNow(-1_000) },
        'expired',
        410,
        'This link has expired',
      ],
      [
        'a disabled link',
        { code: 'disabled', status: StoredLinkStatus.Disabled },
        'disabled',
        410,
        'This link is no longer available',
      ],
    ])(
      'shows a browser an HTML page for %s',
      async (_reason, overrides, code, status, title) => {
        await link(overrides);

        const response = await follow(app, code).set('Accept', BROWSER_ACCEPT);

        expect(response.status).toBe(status);
        expect(response.headers['content-type']).toBe(
          'text/html; charset=utf-8',
        );
        expect(response.text).toContain(`<h1>${title}</h1>`);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['content-security-policy']).toContain(
          "default-src 'none'",
        );
      },
    );

    it.each([
      ['asks for JSON', 'application/json'],
      ['accepts anything', '*/*'],
    ])(
      'gives a client that %s the JSON error body',
      async (_reason, accept) => {
        const response = await follow(app, 'nosuch1').set('Accept', accept);

        expect(response.status).toBe(404);
        expect(response.headers['content-type']).toContain('application/json');
        expect(response.body).toMatchObject({ code: 'LINK_NOT_FOUND' });
      },
    );
  });

  describe('clicks', () => {
    it('hands each 302 to analytics as one click', async () => {
      const created = await link();
      const before = Date.now();

      await follow(app, created.code)
        .set('User-Agent', 'Mozilla/5.0 (test)')
        .set('Referer', 'https://news.example/story?id=1');

      expect(record).toHaveBeenCalledTimes(1);
      const click = record.mock.calls[0]?.[0];
      expect(click).toMatchObject({
        linkId: created.id,
        variantId: null,
        source: 'link',
        userAgent: 'Mozilla/5.0 (test)',
        referrer: 'https://news.example/story?id=1',
      });
      expect(click?.ip).toMatch(/127\.0\.0\.1|::1/);
      expect(click?.clickedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it.each([
      ['r=qr', 'qr'],
      ['r=QR', 'link'],
      ['r=qr&r=qr', 'link'],
      ['q=qr', 'link'],
    ])('records ?%s as source %s', async (query, source) => {
      const { code } = await link();

      await follow(app, `${code}?${query}`);

      expect(record.mock.calls[0]?.[0]).toMatchObject({ source });
    });

    it('records nothing when it does not redirect', async () => {
      const { code } = await link({ status: StoredLinkStatus.Disabled });

      await follow(app, code);
      await follow(app, 'nosuch1');

      expect(record).not.toHaveBeenCalled();
    });

    it('still redirects when analytics fails', async () => {
      record.mockImplementation(() => {
        throw new Error('analytics is down');
      });
      const { code } = await link();

      const response = await follow(app, code);

      expect(response.status).toBe(302);
    });
  });
});

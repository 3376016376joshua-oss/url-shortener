import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StoredLinkStatus } from '../../src/common/link/link-state.js';
import {
  Domain,
  DomainStatus,
} from '../../src/database/entities/domain.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { WorkspaceRole } from '../../src/database/entities/workspace-member.entity.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import { decodePng, decodeSvg } from './decode-qr.js';
import {
  createLink,
  createQrTestApp,
  getBytes,
  qrPath,
  type QrTestApp,
} from './qr-test-app.js';

/** The test APP_URL is plain http without a port, and so are short URLs. */
const SCANNED = 'http://sho.test/abc1234?r=qr';
const UNKNOWN_ID = '0193d2a0-0000-7000-8000-00000000dead';

describe('GET /api/v1/workspaces/:workspaceId/links/:linkId/qr', () => {
  let harness: QrTestApp;
  let app: NestExpressApplication;
  let tenant: WorkspaceFixture;
  let link: Link;
  let path: string;

  beforeAll(async () => {
    harness = await createQrTestApp();
    app = harness.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetState(app);
    harness.reset();
    tenant = await createWorkspaceFixture(app);
    link = await createLink(app, tenant);
    path = qrPath(tenant.workspace.id, link.id);
    harness.signInAs(tenant.principal);
  });

  describe('rendering (AC-26)', () => {
    it('returns an SVG by default that scans to the short URL with the scan marker', async () => {
      const response = await getBytes(app, path);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/svg+xml');
      const svg = (response.body as Buffer).toString('utf8');
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(decodeSvg(svg).content).toBe(SCANNED);
    });

    it('returns a PNG of 512 pixels that scans to the same content', async () => {
      const response = await getBytes(app, `${path}?format=png`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(decodePng(response.body as Buffer)).toEqual({
        content: SCANNED,
        width: 512,
        height: 512,
      });
    });

    it('returns a PNG of the size asked for', async () => {
      const response = await getBytes(app, `${path}?format=png&size=128`);

      expect(decodePng(response.body as Buffer)).toEqual({
        content: SCANNED,
        width: 128,
        height: 128,
      });
    });

    it("encodes the link's own domain", async () => {
      const domain = await app.get(DataSource).getRepository(Domain).save({
        workspaceId: tenant.workspace.id,
        hostname: 'go.brand.test',
        status: DomainStatus.Active,
        verificationToken: 'sv_test',
      });
      const branded = await createLink(app, tenant, {
        domainId: domain.id,
        code: 'launch',
      });

      const response = await getBytes(
        app,
        qrPath(tenant.workspace.id, branded.id),
      );

      expect(
        decodeSvg((response.body as Buffer).toString('utf8')).content,
      ).toBe('http://go.brand.test/launch?r=qr');
    });

    it('never encodes the destination, so the code survives a destination change', async () => {
      const before = await getBytes(app, path);
      await app
        .get(DataSource)
        .getRepository(Link)
        .update(link.id, { destinationUrl: 'https://example.com/elsewhere' });

      const after = await getBytes(app, path);

      expect((after.body as Buffer).equals(before.body as Buffer)).toBe(true);
    });

    it('still renders for a disabled link, whose code may be re-enabled', async () => {
      await app
        .get(DataSource)
        .getRepository(Link)
        .update(link.id, { status: StoredLinkStatus.Disabled });

      const response = await getBytes(app, path);

      expect(response.status).toBe(200);
    });

    it('counts the render by format', async () => {
      await getBytes(app, path);
      await getBytes(app, `${path}?format=png`);

      expect(harness.counters).toEqual([
        { name: 'qr_codes_rendered_total', labels: { format: 'svg' } },
        { name: 'qr_codes_rendered_total', labels: { format: 'png' } },
      ]);
    });
  });

  describe('caching', () => {
    it('sends a strong ETag and private caching for five minutes', async () => {
      const response = await getBytes(app, path);

      expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
      expect(response.headers['cache-control']).toBe('private, max-age=300');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('answers 304 without a body when the caller already has the image', async () => {
      const first = await getBytes(app, path);

      const second = await request(app.getHttpServer())
        .get(path)
        .set('If-None-Match', String(first.headers['etag']));

      expect(second.status).toBe(304);
      expect(second.text).toBe('');
      expect(second.headers['etag']).toBe(first.headers['etag']);
    });

    it('changes the ETag when the image changes', async () => {
      const plain = await getBytes(app, path);
      const styled = await getBytes(app, `${path}?foreground=1a3c8f`);
      const png = await getBytes(app, `${path}?format=png`);

      expect(
        new Set([
          plain.headers['etag'],
          styled.headers['etag'],
          png.headers['etag'],
        ]).size,
      ).toBe(3);
    });
  });

  describe('access', () => {
    it('is 401 without credentials', async () => {
      harness.signInAs(null);

      const response = await request(app.getHttpServer()).get(path);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('lets an API key of the workspace render', async () => {
      harness.signInAs({
        kind: 'api_key',
        userId: null,
        apiKeyId: UNKNOWN_ID,
        isPlatformAdmin: false,
        memberships: [
          { workspaceId: tenant.workspace.id, role: WorkspaceRole.Member },
        ],
      });

      const response = await getBytes(app, path);

      expect(response.status).toBe(200);
    });

    it('is 404 for a caller outside the workspace', async () => {
      const stranger = await createWorkspaceFixture(app);
      harness.signInAs(stranger.principal);

      const response = await request(app.getHttpServer()).get(path);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it("is 404 for another workspace's link under one's own workspace", async () => {
      const stranger = await createWorkspaceFixture(app);
      harness.signInAs(stranger.principal);

      const response = await request(app.getHttpServer()).get(
        qrPath(stranger.workspace.id, link.id),
      );

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('is 404 for a link that does not exist', async () => {
      const response = await request(app.getHttpServer()).get(
        qrPath(tenant.workspace.id, UNKNOWN_ID),
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        code: 'NOT_FOUND',
        message: 'Link not found',
      });
    });
  });

  describe('validation', () => {
    it.each([
      ['an unknown format', 'format=gif'],
      ['a size below 128', 'format=png&size=127'],
      ['a size above 2048', 'format=png&size=2049'],
      ['a size that is not a number', 'size=big'],
      ['a margin above 16', 'margin=17'],
      ['a colour that is not 6 hex digits', 'foreground=red'],
      ['an unknown error correction level', 'errorCorrection=Z'],
      ['a repeated parameter', 'margin=1&margin=2'],
      ['an unknown parameter', 'colour=000000'],
    ])('is 400 for %s', async (_reason, query) => {
      const response = await request(app.getHttpServer()).get(
        `${path}?${query}`,
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('is 400 for a link id that is not a UUID', async () => {
      const response = await request(app.getHttpServer()).get(
        qrPath(tenant.workspace.id, 'not-a-uuid'),
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });
});

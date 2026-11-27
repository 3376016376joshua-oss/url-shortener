import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  qrStylePath,
  type QrTestApp,
} from './qr-test-app.js';

const SCANNED = 'http://sho.test/abc1234?r=qr';
const API_KEY_ID = '0193d2a0-0000-7000-8000-00000000beef';
const BRAND_STYLE = {
  foreground: '1a3c8f',
  background: 'fff8e7',
  margin: 1,
  errorCorrection: 'H',
};
/** Modules across a code with no quiet zone, read from a margin-0 render. */
const sideWithoutMargin = async (
  app: NestExpressApplication,
  path: string,
  errorCorrection: string,
): Promise<number> => {
  const response = await getBytes(
    app,
    `${path}?margin=0&errorCorrection=${errorCorrection}`,
  );
  return decodeSvg((response.body as Buffer).toString('utf8')).width;
};

describe('QR styles', () => {
  let harness: QrTestApp;
  let app: NestExpressApplication;
  let tenant: WorkspaceFixture;
  let link: Link;
  let path: string;
  let stylePath: string;

  const putStyle = (body: object): request.Test =>
    request(app.getHttpServer()).put(stylePath).send(body);
  const storedStyle = async (): Promise<unknown> =>
    (
      await app
        .get(DataSource)
        .getRepository(Link)
        .findOneByOrFail({ id: link.id })
    ).qrStyle;
  const getSvg = async (query = ''): Promise<string> =>
    ((await getBytes(app, `${path}${query}`)).body as Buffer).toString('utf8');

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
    stylePath = qrStylePath(tenant.workspace.id, link.id);
    harness.signInAs(tenant.principal);
  });

  describe('saving and applying a style (AC-27)', () => {
    it('saves a style and returns it', async () => {
      const response = await putStyle({ ...BRAND_STYLE, foreground: '1A3C8F' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(BRAND_STYLE);
      expect(await storedStyle()).toEqual(BRAND_STYLE);
    });

    it('renders with the saved style', async () => {
      await putStyle(BRAND_STYLE);

      const svg = await getSvg();

      expect(svg).toContain('stroke="#1a3c8f"');
      expect(svg).toContain('fill="#fff8e7"');
      const decoded = decodeSvg(svg);
      expect(decoded.content).toBe(SCANNED);
      expect(decoded.width).toBe((await sideWithoutMargin(app, path, 'H')) + 2);
    });

    it('lets query parameters override the saved style for one request', async () => {
      await putStyle(BRAND_STYLE);

      const overridden = await getSvg(
        '?foreground=000000&margin=6&errorCorrection=L',
      );

      expect(overridden).toContain('stroke="#000000"');
      // What the query did not name still comes from the saved style.
      expect(overridden).toContain('fill="#fff8e7"');
      expect(decodeSvg(overridden).width).toBe(
        (await sideWithoutMargin(app, path, 'L')) + 12,
      );
      // And the saved style is untouched.
      expect(await getSvg()).toContain('stroke="#1a3c8f"');
    });

    it('applies the saved style to a PNG too', async () => {
      await putStyle({ foreground: '7a0c2e', background: 'fdf0d5' });

      const response = await getBytes(app, `${path}?format=png&size=256`);

      expect(decodePng(response.body as Buffer)).toEqual({
        content: SCANNED,
        width: 256,
        height: 256,
      });
    });

    it('replaces the whole style: an option left out returns to its default', async () => {
      await putStyle(BRAND_STYLE);

      const response = await putStyle({ foreground: '222222' });

      expect(response.body).toEqual({
        foreground: '222222',
        background: 'ffffff',
        margin: 4,
        errorCorrection: 'M',
      });
    });

    it('clears the saved style when every option is the default', async () => {
      await putStyle(BRAND_STYLE);

      const response = await putStyle({});

      expect(response.status).toBe(200);
      expect(await storedStyle()).toBeNull();
      const [row] = await app
        .get(DataSource)
        .query<Array<{ cleared: boolean }>>(
          'SELECT qr_style IS NULL AS cleared FROM links WHERE id = $1',
          [link.id],
        );
      expect(row?.cleared).toBe(true);
    });

    it('renders with the defaults when the stored style is unreadable', async () => {
      await app
        .get(DataSource)
        .getRepository(Link)
        .update(link.id, { qrStyle: { foreground: 'not-a-colour' } });

      const svg = await getSvg();

      expect(svg).toContain('stroke="#000000"');
      expect(decodeSvg(svg).content).toBe(SCANNED);
    });
  });

  describe('scannability (AC-27)', () => {
    it('refuses to save a low-contrast pair', async () => {
      const response = await putStyle({
        foreground: 'dddddd',
        background: 'ffffff',
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect((response.body as { message: string }).message).toMatch(
        /contrast ratio of at least 3:1/,
      );
      expect(await storedStyle()).toBeNull();
    });

    it('refuses to render a low-contrast pair from the query', async () => {
      const response = await request(app.getHttpServer()).get(
        `${path}?foreground=ffff00&background=ffffff`,
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('refuses an override that clashes with the saved style', async () => {
      await putStyle(BRAND_STYLE);

      // Valid against the default white, but not against the saved cream.
      const response = await request(app.getHttpServer()).get(
        `${path}?foreground=fff8e7`,
      );

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(harness.counters).toEqual([]);
    });
  });

  describe('validation', () => {
    it.each([
      ['an unknown property', { size: 512 }],
      ['a colour with a hash', { foreground: '#000000' }],
      ['a margin above 16', { margin: 17 }],
      ['a margin sent as text', { margin: '4' }],
      ['an unknown error correction level', { errorCorrection: 'X' }],
    ])('is 400 for %s', async (_reason, body) => {
      const response = await putStyle(body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('access and audit', () => {
    it('records who changed the style', async () => {
      await putStyle(BRAND_STYLE);

      expect(harness.auditEntries).toEqual([
        {
          workspaceId: tenant.workspace.id,
          actor: { type: 'user', id: tenant.user.id },
          action: 'link.qr_style_updated',
          target: { type: 'link', id: link.id },
          metadata: BRAND_STYLE,
        },
      ]);
    });

    it('lets an API key of the workspace save a style, and names the key', async () => {
      harness.signInAs({
        kind: 'api_key',
        userId: null,
        apiKeyId: API_KEY_ID,
        isPlatformAdmin: false,
        memberships: [
          { workspaceId: tenant.workspace.id, role: WorkspaceRole.Member },
        ],
      });

      const response = await putStyle(BRAND_STYLE);

      expect(response.status).toBe(200);
      expect(harness.auditEntries[0]?.actor).toEqual({
        type: 'api_key',
        id: API_KEY_ID,
      });
    });

    it('does not report success when the change cannot be audited', async () => {
      harness.failAudit(new Error('audit store is down'));

      const response = await putStyle(BRAND_STYLE);

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    });

    it('is 401 without credentials', async () => {
      harness.signInAs(null);

      const response = await putStyle(BRAND_STYLE);

      expect(response.status).toBe(401);
    });

    it('is 404 for a caller outside the workspace, and changes nothing', async () => {
      const stranger = await createWorkspaceFixture(app);
      harness.signInAs(stranger.principal);

      const outside = await putStyle(BRAND_STYLE);
      const smuggled = await request(app.getHttpServer())
        .put(qrStylePath(stranger.workspace.id, link.id))
        .send(BRAND_STYLE);

      expect(outside.status).toBe(404);
      expect(smuggled.status).toBe(404);
      expect(smuggled.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(await storedStyle()).toBeNull();
      expect(harness.auditEntries).toEqual([]);
    });
  });
});

import { linkSchema, type LinkResponse } from '@url-shortener/contracts/links';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StoredLinkStatus } from '../../src/common/link/link-state.js';
import { LinkDailyTotal } from '../../src/database/entities/link-daily-total.entity.js';
import { LinkVariant } from '../../src/database/entities/link-variant.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  BLOCKED_HOST,
  createLinksHarness,
  linksPath,
  type LinksHarness,
} from './links-harness.js';

const DESTINATION = 'https://example.com/landing';
const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2099-01-01T00:00:00.000Z';

describe('managing a link', () => {
  let harness: LinksHarness;
  let fixture: WorkspaceFixture;
  let link: LinkResponse;

  const linkPath = (id = link.id, target = fixture): string =>
    `${linksPath(target)}/${id}`;
  const patch = (body: Record<string, unknown>) =>
    harness.http().patch(linkPath()).send(body);
  const setStoredStatus = (status: StoredLinkStatus) =>
    harness.dataSource.getRepository(Link).update({ id: link.id }, { status });

  beforeAll(async () => {
    harness = await createLinksHarness();
  });

  beforeEach(async () => {
    await resetState(harness.app);
    fixture = await createWorkspaceFixture(harness.app);
    harness.signIn(fixture.principal);
    const created = await harness
      .http()
      .post(linksPath(fixture))
      .send({ destinationUrl: DESTINATION, code: 'launch', title: 'Launch' });
    link = linkSchema.parse(created.body);
    harness.forget();
    harness.signIn(fixture.principal);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  describe('GET', () => {
    it('returns the link', async () => {
      const response = await harness.http().get(linkPath());

      expect(response.status).toBe(200);
      expect(response.body).toEqual(link);
    });

    it('reports a link past its expiry as EXPIRED', async () => {
      await patch({ expiresAt: PAST });

      const response = await harness.http().get(linkPath());

      expect(response.body).toMatchObject({
        status: 'EXPIRED',
        expiresAt: PAST,
      });
    });

    it('reports a disabled link as DISABLED even past its expiry', async () => {
      await patch({ expiresAt: PAST, status: 'DISABLED' });

      const response = await harness.http().get(linkPath());

      expect(response.body).toMatchObject({ status: 'DISABLED' });
    });

    it("answers 404 for an unknown link and for another workspace's", async () => {
      const other = await createWorkspaceFixture(harness.app);

      const unknown = await harness.http().get(linkPath(fixture.workspace.id));
      harness.signIn(other.principal);
      const foreign = await harness.http().get(linkPath(link.id, other));

      expect(unknown.status).toBe(404);
      expect(unknown.body).toMatchObject({ code: 'NOT_FOUND' });
      expect(foreign.status).toBe(404);
    });

    it('answers a malformed link id with 400', async () => {
      const response = await harness.http().get(linkPath('launch'));

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH', () => {
    it('changes destination, title, and expiry, and nothing else', async () => {
      const response = await patch({
        destinationUrl: 'https://example.com/New Page',
        title: 'Relaunch',
        expiresAt: FUTURE,
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ...link,
        destinationUrl: 'https://example.com/New%20Page',
        title: 'Relaunch',
        expiresAt: FUTURE,
        updatedAt: expect.any(String) as string,
      });
      expect(
        Date.parse(linkSchema.parse(response.body).updatedAt),
      ).toBeGreaterThan(Date.parse(link.updatedAt));
    });

    it('removes the title and the expiry with null', async () => {
      await patch({ expiresAt: FUTURE });

      const response = await patch({ title: null, expiresAt: null });

      expect(response.body).toMatchObject({ title: null, expiresAt: null });
    });

    it('disables and enables the link', async () => {
      const disabled = await patch({ status: 'DISABLED' });
      const enabled = await patch({ status: 'ACTIVE' });

      expect(disabled.body).toMatchObject({ status: 'DISABLED' });
      expect(enabled.body).toMatchObject({ status: 'ACTIVE' });
    });

    it('brings an expired link back by moving its expiry', async () => {
      await patch({ expiresAt: PAST });

      const response = await patch({ expiresAt: FUTURE });

      expect(response.body).toMatchObject({ status: 'ACTIVE' });
    });

    it('invalidates the redirect cache and audits the change', async () => {
      await patch({
        destinationUrl: 'https://other.example/?token=secret',
        status: 'DISABLED',
      });

      expect(harness.invalidations).toEqual([
        { hostname: 'sho.test', code: 'launch' },
      ]);
      expect(harness.auditEntries).toEqual([
        {
          workspaceId: fixture.workspace.id,
          actor: { type: 'user', id: fixture.user.id },
          action: 'link.updated',
          target: { type: 'link', id: link.id },
          metadata: {
            fields: ['destinationUrl', 'status'],
            destinationHost: 'other.example',
            status: 'DISABLED',
          },
        },
      ]);
      expect(JSON.stringify(harness.auditEntries)).not.toContain('secret');
    });

    it.each([
      ['no field', {}],
      ['a code', { code: 'other' }],
      ['a domain', { domainId: '0193d2a0-5a00-7c11-8e22-1f0e9d8c7b6a' }],
      ['the status BLOCKED', { status: 'BLOCKED' }],
      ['the status EXPIRED', { status: 'EXPIRED' }],
      ['a destination that is not http(s)', { destinationUrl: 'ftp://a.test' }],
      ['a null destination', { destinationUrl: null }],
    ])(
      'answers %s with 400 and changes nothing',
      async (_description, body) => {
        const response = await patch(body);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
        expect((await harness.http().get(linkPath())).body).toEqual(link);
        expect(harness.invalidations).toEqual([]);
      },
    );

    it('runs the risk check on a new destination', async () => {
      const response = await patch({
        destinationUrl: `https://${BLOCKED_HOST}/offer`,
      });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'DESTINATION_BLOCKED' });
      expect((await harness.http().get(linkPath())).body).toEqual(link);
    });

    it('answers 404 for an unknown link', async () => {
      const response = await harness
        .http()
        .patch(linkPath(fixture.workspace.id))
        .send({ title: 'x' });

      expect(response.status).toBe(404);
    });
  });

  describe('a link blocked by the platform', () => {
    let blocked: LinkResponse;

    beforeEach(async () => {
      await setStoredStatus(StoredLinkStatus.Blocked);
      blocked = linkSchema.parse((await harness.http().get(linkPath())).body);
    });

    it('is reported as BLOCKED', () => {
      expect(blocked).toMatchObject({ id: link.id, status: 'BLOCKED' });
    });

    it.each([
      ['re-enabled', { status: 'ACTIVE' }],
      ['pointed elsewhere', { destinationUrl: 'https://example.com/clean' }],
      ['renamed', { title: 'Innocent' }],
    ])('cannot be %s', async (_description, body) => {
      const response = await patch(body);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'CONFLICT' });
      expect((await harness.http().get(linkPath())).body).toEqual(blocked);
      expect(harness.auditEntries).toEqual([]);
    });

    it('cannot be deleted to free its code', async () => {
      const response = await harness.http().delete(linkPath());

      expect(response.status).toBe(409);
      expect(await harness.dataSource.getRepository(Link).count()).toBe(1);
    });
  });

  describe('DELETE', () => {
    it('removes the link, its variants, and its roll-ups', async () => {
      await harness.dataSource.getRepository(LinkVariant).save({
        linkId: link.id,
        name: 'B',
        destinationUrl: DESTINATION,
        weight: 10,
      });
      await harness.dataSource
        .getRepository(LinkDailyTotal)
        .save({ linkId: link.id, day: '2026-11-27', clicks: '3' });

      const response = await harness.http().delete(linkPath());

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      expect((await harness.http().get(linkPath())).status).toBe(404);
      expect(await harness.dataSource.getRepository(LinkVariant).count()).toBe(
        0,
      );
      expect(
        await harness.dataSource.getRepository(LinkDailyTotal).count(),
      ).toBe(0);
    });

    it('invalidates the redirect cache and audits the deletion', async () => {
      await harness.http().delete(linkPath());

      expect(harness.invalidations).toEqual([
        { hostname: 'sho.test', code: 'launch' },
      ]);
      expect(harness.auditEntries).toEqual([
        {
          workspaceId: fixture.workspace.id,
          actor: { type: 'user', id: fixture.user.id },
          action: 'link.deleted',
          target: { type: 'link', id: link.id },
          metadata: { code: 'launch', domainId: fixture.domain.id },
        },
      ]);
    });

    it('frees the code for reuse', async () => {
      await harness.http().delete(linkPath());

      const response = await harness
        .http()
        .post(linksPath(fixture))
        .send({ destinationUrl: DESTINATION, code: 'launch' });

      expect(response.status).toBe(201);
    });

    it("answers 404 for another workspace's link and leaves it alone", async () => {
      const other = await createWorkspaceFixture(harness.app);
      harness.signIn(other.principal);

      const response = await harness.http().delete(linkPath(link.id, other));

      expect(response.status).toBe(404);
      expect(await harness.dataSource.getRepository(Link).count()).toBe(1);
    });
  });
});

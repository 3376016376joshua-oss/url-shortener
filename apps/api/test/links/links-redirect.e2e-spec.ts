import type { NestExpressApplication } from '@nestjs/platform-express';
import { linkSchema, type LinkResponse } from '@url-shortener/contracts/links';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../support/create-test-app.js';
import {
  authenticatedAs,
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import { linksPath } from './links-harness.js';

const FIRST = 'https://example.com/first';
const SECOND = 'https://example.com/second';

/**
 * The write path against the real redirect and its real cache: every change
 * made through the API is what the very next visitor gets.
 */
describe('link changes reach the redirect at once', () => {
  let app: NestExpressApplication;
  let fixture: WorkspaceFixture;
  let link: LinkResponse;

  const api = () => request(app.getHttpServer());
  const follow = (code = link.code) =>
    api().get(`/${code}`).set('Host', 'sho.test').set('Accept', '*/*');
  const patch = (body: Record<string, unknown>) =>
    api()
      .patch(`${linksPath(fixture)}/${link.id}`)
      .send(body);

  beforeAll(async () => {
    app = await createTestApp(authenticatedAs(() => fixture.principal));
  });

  beforeEach(async () => {
    await resetState(app);
    fixture = await createWorkspaceFixture(app);
    const created = await api()
      .post(linksPath(fixture))
      .send({ destinationUrl: FIRST });
    link = linkSchema.parse(created.body);
  });

  afterAll(async () => {
    await app.close();
  });

  it('redirects a new link with 302 to its normalised destination', async () => {
    const response = await follow();

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(FIRST);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('serves a code that was looked up before the link existed', async () => {
    expect((await follow('launch')).status).toBe(404);

    await api()
      .post(linksPath(fixture))
      .send({ destinationUrl: FIRST, code: 'launch' });

    expect((await follow('launch')).status).toBe(302);
  });

  it('answers 410 right after disabling and 302 right after enabling', async () => {
    await follow();

    await patch({ status: 'DISABLED' });
    const disabled = await follow();
    await patch({ status: 'ACTIVE' });
    const enabled = await follow();

    expect(disabled.status).toBe(410);
    expect(disabled.body).toMatchObject({ code: 'LINK_DISABLED' });
    expect(enabled.status).toBe(302);
  });

  it('sends the next visitor to a changed destination', async () => {
    await follow();

    await patch({ destinationUrl: SECOND });

    expect((await follow()).headers.location).toBe(SECOND);
  });

  it('answers 410 once the expiry is moved into the past', async () => {
    await follow();

    await patch({ expiresAt: '2020-01-01T00:00:00Z' });
    const response = await follow();

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({ code: 'LINK_EXPIRED' });
  });

  it('answers 404 right after deletion', async () => {
    await follow();

    await api().delete(`${linksPath(fixture)}/${link.id}`);

    expect((await follow()).status).toBe(404);
  });

  it('sends every visitor to a promoted variant', async () => {
    await follow();
    const variant = await api()
      .post(`${linksPath(fixture)}/${link.id}/variants`)
      .send({ name: 'B', destinationUrl: SECOND, weight: 1 });

    await api().post(
      `${linksPath(fixture)}/${link.id}/variants/${(variant.body as { id: string }).id}/promote`,
    );

    expect((await follow()).headers.location).toBe(SECOND);
  });
});

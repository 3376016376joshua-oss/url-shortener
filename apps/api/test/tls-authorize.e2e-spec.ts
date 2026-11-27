import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainStatus } from '../src/database/entities/domain.entity.js';
import {
  createDomainTestKit,
  domainOf,
  setDomain,
  type DomainTestKit,
} from './domains/domain-test-kit.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from './support/fixtures.js';
import { resetState } from './support/reset-state.js';
import { testEnv } from './support/test-env.js';

const APP_HOST = new URL(testEnv.APP_URL).hostname;

describe('GET /internal/tls/authorize', () => {
  let kit: DomainTestKit;
  let fixture: WorkspaceFixture;

  const authorize = (domain: string) =>
    request(kit.app.getHttpServer())
      .get('/internal/tls/authorize')
      .query({ domain });

  const claimWithStatus = async (
    hostname: string,
    status: DomainStatus,
  ): Promise<void> => {
    const response = await request(kit.app.getHttpServer())
      .post(`/api/v1/workspaces/${fixture.workspace.id}/domains`)
      .send({ hostname });
    await setDomain(kit.app, domainOf(response).id, { status });
  };

  beforeAll(async () => {
    kit = await createDomainTestKit();
  });

  beforeEach(async () => {
    await resetState(kit.app);
    kit.reset();
    fixture = await createWorkspaceFixture(kit.app);
    kit.signIn(fixture.principal);
  });

  afterAll(async () => {
    await kit.app.close();
  });

  it('answers 200 for an active custom domain, without credentials', async () => {
    await claimWithStatus('go.brand.com', DomainStatus.Active);
    kit.signIn(null);

    const response = await authorize('go.brand.com');

    expect(response.status).toBe(200);
    expect(response.text).toBe('');
  });

  it('matches the host whatever its case', async () => {
    await claimWithStatus('go.brand.com', DomainStatus.Active);

    expect((await authorize('GO.Brand.com')).status).toBe(200);
  });

  it.each([
    ['the platform short domain', testEnv.DEFAULT_SHORT_DOMAIN],
    ['the app host', APP_HOST],
    ['the CNAME target', testEnv.CNAME_TARGET],
  ])('answers 200 for %s', async (_name, host) => {
    expect((await authorize(host)).status).toBe(200);
  });

  it.each([
    ['a pending', DomainStatus.Pending],
    ['an inactive', DomainStatus.Inactive],
    ['a blocked', DomainStatus.Blocked],
  ])('answers 404 for %s domain', async (_name, status) => {
    await claimWithStatus('go.brand.com', status);

    const response = await authorize('go.brand.com');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each([
    ['an unknown host', 'unknown.brand.com'],
    ['a subdomain of an active domain', 'www.go.brand.com'],
    ['a subdomain of a platform host', `evil.${testEnv.DEFAULT_SHORT_DOMAIN}`],
    ['an IP address', '203.0.113.10'],
  ])('answers 404 for %s', async (_name, host) => {
    await claimWithStatus('go.brand.com', DomainStatus.Active);

    expect((await authorize(host)).status).toBe(404);
  });

  it('answers 400 when the edge names no host', async () => {
    const response = await request(kit.app.getHttpServer()).get(
      '/internal/tls/authorize',
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

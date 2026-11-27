import type { NestExpressApplication } from '@nestjs/platform-express';
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
import {
  DestinationSelector,
  type RedirectTarget,
  type SelectedDestination,
  type Visitor,
} from '../../src/experiments/destination-selector.js';
import { linkKey } from '../../src/link-cache/cache-policy.js';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../src/redis/redis-client.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  PLATFORM_HOST,
  createLink,
  createVariant,
  follow,
} from './redirect-fixtures.js';

const CONTROL_URL = 'https://example.com/control';
const VARIANT_URL = 'https://example.com/variant-b';

describe('GET /{code} on a link with an A/B test', () => {
  let app: NestExpressApplication;
  let tenant: WorkspaceFixture;
  const record = vi.fn<(click: ClickInput) => void>();
  const select =
    vi.fn<(target: RedirectTarget, visitor: Visitor) => SelectedDestination>();

  /** Serves the first variant when there is one, like a 100% test would. */
  const serveFirstVariant = (target: RedirectTarget): SelectedDestination => {
    const [variant] = target.variants;
    return variant === undefined
      ? { destinationUrl: target.destinationUrl, variantId: null }
      : { destinationUrl: variant.destinationUrl, variantId: variant.id };
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ClickRecorder)
        .useValue({ record })
        .overrideProvider(DestinationSelector)
        .useValue({ select }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetState(app);
    record.mockReset();
    select.mockReset().mockImplementation(serveFirstVariant);
    tenant = await createWorkspaceFixture(app);
  });

  const linkUnderTest = () =>
    createLink(app, tenant.domain, tenant.workspace.id, {
      destinationUrl: CONTROL_URL,
    });

  it('redirects to the destination the selector chose and reports the variant', async () => {
    const link = await linkUnderTest();
    const variant = await createVariant(app, link, {
      name: 'B',
      destinationUrl: VARIANT_URL,
      weight: 30,
    });

    const response = await follow(app, link.code);

    expect(response.status).toBe(302);
    expect(response.headers['location']).toBe(VARIANT_URL);
    expect(record.mock.calls[0]?.[0]).toMatchObject({
      linkId: link.id,
      variantId: variant.id,
    });
  });

  it('offers the selector the active variants in order of creation, and the visitor', async () => {
    const link = await linkUnderTest();
    const second = await createVariant(app, link, {
      name: 'second',
      destinationUrl: 'https://example.com/2',
      weight: 20,
      createdAt: new Date('2026-11-02T00:00:00Z'),
    });
    await createVariant(app, link, {
      name: 'archived',
      destinationUrl: 'https://example.com/archived',
      weight: 50,
      archivedAt: new Date(),
      createdAt: new Date('2026-11-01T12:00:00Z'),
    });
    const first = await createVariant(app, link, {
      name: 'first',
      destinationUrl: 'https://example.com/1',
      weight: 10,
      createdAt: new Date('2026-11-01T00:00:00Z'),
    });

    // Once from Postgres, once from the cache: both must look the same.
    await follow(app, link.code).set('User-Agent', 'agent-a');
    await follow(app, link.code).set('User-Agent', 'agent-a');

    expect(select).toHaveBeenCalledTimes(2);
    for (const [target, visitor] of select.mock.calls) {
      expect(target).toEqual({
        linkId: link.id,
        destinationUrl: CONTROL_URL,
        variants: [
          { id: first.id, destinationUrl: 'https://example.com/1', weight: 10 },
          {
            id: second.id,
            destinationUrl: 'https://example.com/2',
            weight: 20,
          },
        ],
      });
      expect(visitor).toEqual({
        ip: expect.stringMatching(/127\.0\.0\.1|::1/) as string,
        userAgent: 'agent-a',
      });
    }
  });

  it('serves the control when the selector fails', async () => {
    const link = await linkUnderTest();
    await createVariant(app, link, {
      name: 'B',
      destinationUrl: VARIANT_URL,
      weight: 30,
    });
    select.mockImplementation(() => {
      throw new Error('assignment failed');
    });

    const response = await follow(app, link.code);

    expect(response.status).toBe(302);
    expect(response.headers['location']).toBe(CONTROL_URL);
    expect(record.mock.calls[0]?.[0]).toMatchObject({ variantId: null });
  });

  it('serves the control when the cached variants cannot be read', async () => {
    const link = await linkUnderTest();
    await app.get<RedisClient>(REDIS_CLIENT).set(
      linkKey(PLATFORM_HOST, link.code),
      JSON.stringify({
        id: link.id,
        domainId: tenant.domain.id,
        destinationUrl: CONTROL_URL,
        status: 'ACTIVE',
        expiresAt: null,
        variants: [{ id: 'broken', weight: 'half' }],
      }),
    );
    await follow(app, 'warm-the-domain-key');

    const response = await follow(app, link.code);

    expect(response.headers['location']).toBe(CONTROL_URL);
    expect(select.mock.calls.at(-1)?.[0].variants).toEqual([]);
  });
});

import { Logger } from '@nestjs/common';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CounterName, Metrics } from '../../src/common/metrics/metrics.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { CodeGenerator } from '../../src/links/code-generator.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  createLinksHarness,
  linksPath,
  type LinksHarness,
} from './links-harness.js';

const DESTINATION = 'https://example.com/landing';
const TAKEN = 'taken00';

describe('generated code collisions', () => {
  let harness: LinksHarness;
  let fixture: WorkspaceFixture;
  /** The codes the generator will hand out, in order. */
  let upcoming: string[];
  let counted: Array<{ name: string; labels?: Record<string, string> }>;

  const create = () =>
    harness
      .http()
      .post(linksPath(fixture))
      .send({ destinationUrl: DESTINATION });

  beforeAll(async () => {
    harness = await createLinksHarness((builder) =>
      builder
        .overrideProvider(CodeGenerator)
        .useValue({
          generate: (): string => {
            const code = upcoming.shift();
            if (code === undefined) {
              throw new Error('The test ran out of generated codes');
            }
            return code;
          },
        })
        .overrideProvider(Metrics)
        .useValue({
          incrementCounter: (name: string, labels?: Record<string, string>) =>
            counted.push({ name, labels }),
          setGauge: () => undefined,
        }),
    );
  });

  beforeEach(async () => {
    await resetState(harness.app);
    harness.forget();
    counted = [];
    fixture = await createWorkspaceFixture(harness.app);
    harness.signIn(fixture.principal);
    await harness.dataSource.getRepository(Link).save({
      workspaceId: fixture.workspace.id,
      domainId: fixture.domain.id,
      code: TAKEN,
      destinationUrl: DESTINATION,
    });
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('retries with a new code and succeeds', async () => {
    upcoming = [TAKEN, TAKEN, 'fresh01'];

    const response = await create();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ code: 'fresh01' });
    expect(
      counted.filter(({ name }) => name === CounterName.ShortCodeCollisions),
    ).toHaveLength(2);
    expect(counted).toContainEqual({
      name: CounterName.LinksCreated,
      labels: { kind: 'generated' },
    });
  });

  it('succeeds on the fifth attempt', async () => {
    upcoming = [TAKEN, TAKEN, TAKEN, TAKEN, 'fresh05'];

    const response = await create();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ code: 'fresh05' });
  });

  it('gives up with 503 after 5 collisions', async () => {
    // The filter logs every 5xx; this one is the expected outcome.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    upcoming = [TAKEN, TAKEN, TAKEN, TAKEN, TAKEN, 'never06'];

    const response = await create();

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      statusCode: 503,
      code: 'CODE_GENERATION_EXHAUSTED',
    });
    expect(upcoming).toEqual(['never06']);
    expect(harness.invalidations).toEqual([]);
    expect(await harness.dataSource.getRepository(Link).count()).toBe(1);
  });

  it('never hands out a reserved word, and does not count it as a collision', async () => {
    upcoming = ['metrics', 'Metrics', 'fresh07'];

    const response = await create();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ code: 'fresh07' });
    expect(
      counted.filter(({ name }) => name === CounterName.ShortCodeCollisions),
    ).toEqual([]);
  });

  it('counts a custom code as custom', async () => {
    const response = await harness
      .http()
      .post(linksPath(fixture))
      .send({ destinationUrl: DESTINATION, code: 'launch' });

    expect(response.status).toBe(201);
    expect(counted).toContainEqual({
      name: CounterName.LinksCreated,
      labels: { kind: 'custom' },
    });
  });
});

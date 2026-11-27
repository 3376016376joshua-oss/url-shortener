import { variantSchema } from '@url-shortener/contracts/links';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BLOCKED_HOST,
  createLinksHarness,
  type LinksHarness,
} from './links-harness.js';
import {
  CONTROL,
  VARIANT_B,
  createVariantsScene,
  type VariantsScene,
} from './variants-scene.js';

describe('A/B test variants', () => {
  let harness: LinksHarness;
  let scene: VariantsScene;

  beforeAll(async () => {
    harness = await createLinksHarness();
  });

  beforeEach(async () => {
    scene = await createVariantsScene(harness);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('adds a variant to a link already in circulation', async () => {
    const response = await scene.post({
      name: ' Shorter headline ',
      destinationUrl: 'HTTPS://Example.com/landing-b',
      weight: 30,
    });

    expect(response.status).toBe(201);
    expect(variantSchema.parse(response.body)).toMatchObject({
      name: 'Shorter headline',
      destinationUrl: VARIANT_B,
      weight: 30,
      archivedAt: null,
    });
    expect(await scene.getLink()).toMatchObject({
      code: 'launch',
      destinationUrl: CONTROL,
      variantCount: 1,
    });
  });

  it('invalidates the redirect cache and audits every change', async () => {
    const variant = await scene.addVariant(30, 'B');
    await scene.patch(variant.id, { weight: 40 });
    await scene.act(variant, 'archive');

    expect(harness.invalidations).toEqual(
      Array.from({ length: 3 }, () => ({
        hostname: 'sho.test',
        code: 'launch',
      })),
    );
    expect(harness.auditEntries.map(({ action }) => action)).toEqual([
      'variant.created',
      'variant.updated',
      'variant.archived',
    ]);
    expect(harness.auditEntries[0]).toEqual({
      workspaceId: scene.fixture.workspace.id,
      actor: { type: 'user', id: scene.fixture.user.id },
      action: 'variant.created',
      target: { type: 'variant', id: variant.id },
      metadata: {
        linkId: scene.link.id,
        name: 'B',
        weight: 30,
        destinationHost: 'example.com',
      },
    });
  });

  it('lists every variant, oldest first, archived included', async () => {
    const first = await scene.addVariant(10, 'First');
    const second = await scene.addVariant(20, 'Second');
    await scene.act(first, 'archive');

    const variants = await scene.listVariants();

    expect(variants.map(({ id }) => id)).toEqual([first.id, second.id]);
    expect(variants[0]?.archivedAt).not.toBeNull();
    expect(variants[1]?.archivedAt).toBeNull();
  });

  it('refuses a fifth variant with 422 QUOTA_EXCEEDED', async () => {
    for (const weight of [10, 11, 12, 13]) {
      await scene.addVariant(weight);
    }

    const response = await scene.post({
      name: 'E',
      destinationUrl: VARIANT_B,
      weight: 1,
    });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(await scene.listVariants()).toHaveLength(4);
  });

  it('makes room for a new variant when one is archived', async () => {
    const first = await scene.addVariant(10);
    for (const weight of [11, 12, 13]) {
      await scene.addVariant(weight);
    }
    await scene.act(first, 'archive');

    await scene.addVariant(14);

    expect(await scene.getLink()).toMatchObject({ variantCount: 4 });
    expect(await scene.listVariants()).toHaveLength(5);
  });

  it('keeps the active weights at 99 or less, so the control keeps traffic', async () => {
    await scene.addVariant(60);
    const fits = await scene.addVariant(39);

    const tooMuch = await scene.post({
      name: 'C',
      destinationUrl: VARIANT_B,
      weight: 1,
    });
    const grown = await scene.patch(fits.id, { weight: 40 });

    for (const response of [tooMuch, grown]) {
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
    }
    expect((await scene.listVariants()).map(({ weight }) => weight)).toEqual([
      60, 39,
    ]);
  });

  it('holds the weight limit against simultaneous requests', async () => {
    const responses = await Promise.all(
      ['C', 'D', 'E'].map((name) =>
        scene.post({ name, destinationUrl: VARIANT_B, weight: 40 }),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([
      201, 201, 422,
    ]);
    expect(await scene.listVariants()).toHaveLength(2);
  });

  it('holds the variant quota against simultaneous requests', async () => {
    for (const weight of [10, 11, 12]) {
      await scene.addVariant(weight);
    }

    const responses = await Promise.all(
      ['D', 'E', 'F'].map((name) =>
        scene.post({ name, destinationUrl: VARIANT_B, weight: 1 }),
      ),
    );

    expect(responses.map(({ status }) => status).sort()).toEqual([
      201, 422, 422,
    ]);
    expect(await scene.listVariants()).toHaveLength(4);
  });

  it('does not count archived variants against the weight limit', async () => {
    const heavy = await scene.addVariant(90);
    await scene.act(heavy, 'archive');

    await scene.addVariant(99);
  });

  it.each([
    ['a missing name', { destinationUrl: VARIANT_B, weight: 10 }],
    ['a weight of 0', { name: 'B', destinationUrl: VARIANT_B, weight: 0 }],
    ['a weight of 100', { name: 'B', destinationUrl: VARIANT_B, weight: 100 }],
    [
      'a destination that is not http(s)',
      { name: 'B', destinationUrl: 'ftp://a.test', weight: 10 },
    ],
    [
      'an unknown property',
      { name: 'B', destinationUrl: VARIANT_B, weight: 10, archivedAt: null },
    ],
    [
      'a name over 50 characters',
      { name: 'n'.repeat(51), destinationUrl: VARIANT_B, weight: 10 },
    ],
  ])('answers %s with 400', async (_description, body) => {
    const response = await scene.post(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('runs the destination risk check on create and on change', async () => {
    const variant = await scene.addVariant(10);
    const blocked = `https://${BLOCKED_HOST}/offer`;

    const created = await scene.post({
      name: 'B',
      destinationUrl: blocked,
      weight: 10,
    });
    const changed = await scene.patch(variant.id, {
      destinationUrl: 'http://127.0.0.1/',
    });

    for (const response of [created, changed]) {
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'DESTINATION_BLOCKED' });
    }
  });

  it('changes the name, destination, and weight of a variant', async () => {
    const variant = await scene.addVariant(10, 'B');

    const response = await scene.patch(variant.id, {
      name: 'Bolder',
      destinationUrl: 'https://example.com/c',
      weight: 25,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...variant,
      name: 'Bolder',
      destinationUrl: 'https://example.com/c',
      weight: 25,
    });
    expect((await scene.patch(variant.id, {})).status).toBe(400);
  });
});

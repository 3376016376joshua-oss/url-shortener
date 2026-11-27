import { linkSchema, variantSchema } from '@url-shortener/contracts/links';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StoredLinkStatus } from '../../src/common/link/link-state.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { createWorkspaceFixture } from '../support/fixtures.js';
import { createLinksHarness, type LinksHarness } from './links-harness.js';
import {
  CONTROL,
  VARIANT_B,
  createVariantsScene,
  type VariantsScene,
} from './variants-scene.js';

describe('ending an A/B test', () => {
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

  it('archives a variant, which then cannot be changed or promoted', async () => {
    const variant = await scene.addVariant(30);

    const archived = await scene.act(variant, 'archive');
    const again = await scene.act(variant, 'archive');
    const changed = await scene.patch(variant.id, { weight: 5 });
    const promoted = await scene.act(variant, 'promote');

    expect(archived.status).toBe(200);
    expect(variantSchema.parse(archived.body).archivedAt).not.toBeNull();
    expect(again.body).toEqual(archived.body);
    expect(changed.status).toBe(409);
    expect(promoted.status).toBe(409);
    expect(promoted.body).toMatchObject({ code: 'CONFLICT' });
    expect(await scene.getLink()).toMatchObject({
      destinationUrl: CONTROL,
      variantCount: 0,
    });
  });

  it("promotes a variant: its destination becomes the link's and the test is archived", async () => {
    const winner = await scene.addVariant(30, 'Winner');
    await scene.addVariant(20, 'Loser');

    const response = await scene.act(winner, 'promote');

    expect(response.status).toBe(200);
    expect(linkSchema.parse(response.body)).toMatchObject({
      id: scene.link.id,
      code: 'launch',
      destinationUrl: VARIANT_B,
      variantCount: 0,
    });
    const variants = await scene.listVariants();
    expect(variants.map(({ name }) => name)).toEqual(['Winner', 'Loser']);
    expect(variants.every(({ archivedAt }) => archivedAt !== null)).toBe(true);
    expect(harness.auditEntries.at(-1)).toMatchObject({
      action: 'variant.promoted',
      target: { type: 'variant', id: winner.id },
    });
    expect(harness.invalidations).toHaveLength(3);
  });

  it('answers 404 for unknown links and variants, and across workspaces', async () => {
    const variant = await scene.addVariant(10);
    const other = await createWorkspaceFixture(harness.app);
    const otherLink = await harness.dataSource.getRepository(Link).save({
      workspaceId: other.workspace.id,
      domainId: other.domain.id,
      code: 'theirs',
      destinationUrl: CONTROL,
    });
    const unknownId = scene.fixture.workspace.id;

    const responses = [
      await harness.http().get(scene.variantsPath(unknownId)),
      await harness
        .http()
        .post(scene.variantsPath(unknownId))
        .send({ name: 'B', destinationUrl: VARIANT_B, weight: 10 }),
      await scene.patch(unknownId, { weight: 5 }),
      await harness.http().post(`${scene.variantsPath()}/${unknownId}/archive`),
      await harness.http().post(`${scene.variantsPath()}/${unknownId}/promote`),
      // A real variant, addressed through a link it does not belong to.
      await harness.http().get(scene.variantsPath(otherLink.id)),
      await harness
        .http()
        .post(`${scene.variantsPath(otherLink.id)}/${variant.id}/promote`),
      await harness.http().get(scene.variantsPath(scene.link.id, other)),
    ];

    expect(responses.map(({ status }) => status)).toEqual(Array(8).fill(404));
    expect(
      (await harness.http().get(`${scene.variantsPath()}/x/archive`)).status,
    ).toBe(404);
    expect(
      (await harness.http().post(`${scene.variantsPath()}/x/archive`)).status,
    ).toBe(400);
  });

  it('cannot change the variants of a link blocked by the platform', async () => {
    const variant = await scene.addVariant(10);
    await harness.dataSource
      .getRepository(Link)
      .update({ id: scene.link.id }, { status: StoredLinkStatus.Blocked });

    const responses = [
      await scene.post({ name: 'C', destinationUrl: VARIANT_B, weight: 10 }),
      await scene.patch(variant.id, { weight: 5 }),
      await scene.act(variant, 'archive'),
      await scene.act(variant, 'promote'),
    ];

    expect(responses.map(({ status }) => status)).toEqual(Array(4).fill(409));
    expect(await scene.listVariants()).toEqual([variant]);
  });
});

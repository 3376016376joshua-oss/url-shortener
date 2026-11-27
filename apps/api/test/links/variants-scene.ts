import {
  linkSchema,
  variantListSchema,
  variantSchema,
  type LinkResponse,
  type VariantResponse,
} from '@url-shortener/contracts/links';
import type { Test } from 'supertest';
import { expect } from 'vitest';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import { linksPath, type LinksHarness } from './links-harness.js';

export const CONTROL = 'https://example.com/landing';
export const VARIANT_B = 'https://example.com/landing-b';

/** A fresh workspace, signed in, with one link (`launch`) to run a test on. */
export interface VariantsScene {
  fixture: WorkspaceFixture;
  link: LinkResponse;
  variantsPath(linkId?: string, target?: WorkspaceFixture): string;
  post(body: Record<string, unknown>): Test;
  patch(variantId: string, body: Record<string, unknown>): Test;
  act(variant: VariantResponse, action: 'archive' | 'promote'): Test;
  /** Adds a variant pointing at `VARIANT_B` and expects it to succeed. */
  addVariant(weight: number, name?: string): Promise<VariantResponse>;
  getLink(): Promise<LinkResponse>;
  listVariants(): Promise<VariantResponse[]>;
}

/** Resets all state and builds the scene. Call from `beforeEach`. */
export async function createVariantsScene(
  harness: LinksHarness,
): Promise<VariantsScene> {
  await resetState(harness.app);
  const fixture = await createWorkspaceFixture(harness.app);
  harness.signIn(fixture.principal);
  const created = await harness
    .http()
    .post(linksPath(fixture))
    .send({ destinationUrl: CONTROL, code: 'launch' });
  const link = linkSchema.parse(created.body);
  harness.forget();
  harness.signIn(fixture.principal);

  const variantsPath = (linkId = link.id, target = fixture): string =>
    `${linksPath(target)}/${linkId}/variants`;
  const post = (body: Record<string, unknown>): Test =>
    harness.http().post(variantsPath()).send(body);

  return {
    fixture,
    link,
    variantsPath,
    post,
    patch: (variantId, body) =>
      harness.http().patch(`${variantsPath()}/${variantId}`).send(body),
    act: (variant, action) =>
      harness.http().post(`${variantsPath()}/${variant.id}/${action}`),
    addVariant: async (weight, name = `Variant ${weight}`) => {
      const response = await post({ name, destinationUrl: VARIANT_B, weight });
      expect(response.status).toBe(201);
      return variantSchema.parse(response.body);
    },
    getLink: async () =>
      linkSchema.parse(
        (await harness.http().get(`${linksPath(fixture)}/${link.id}`)).body,
      ),
    listVariants: async () =>
      variantListSchema.parse((await harness.http().get(variantsPath())).body)
        .items,
  };
}

import { json, type MockApi } from '../support/mock-api.js';

export const ACME = 'ws-acme';
export const GLOBEX = 'ws-globex';

export const SAMPLE_LINKS = [
  { id: 'link-1', title: 'Spring launch', shortUrl: 'https://sho.rt/launch' },
  { id: 'link-2', title: 'Careers page', shortUrl: 'https://sho.rt/jobs' },
];

/** Makes the fixture link list of a workspace answer with `items`. */
export function mockLinks(
  api: MockApi,
  workspaceId: string,
  items: ReadonlyArray<unknown> = SAMPLE_LINKS,
): void {
  api.on(`GET /workspaces/${workspaceId}/links`, () => json({ items }));
}

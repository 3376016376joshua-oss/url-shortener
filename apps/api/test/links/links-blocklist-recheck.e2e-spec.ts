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
import { StoredLinkStatus } from '../../src/common/link/link-state.js';
import { LinkVariant } from '../../src/database/entities/link-variant.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { BlocklistRecheckJob } from '../../src/links/blocklist-recheck.job.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';
import {
  BLOCKED_HOST,
  createLinksHarness,
  type LinksHarness,
} from './links-harness.js';

const CLEAN = 'https://example.com/landing';
const BAD = `https://www.${BLOCKED_HOST}/offer?token=secret`;

describe('daily blocklist re-check', () => {
  let harness: LinksHarness;
  let fixture: WorkspaceFixture;

  const insertLink = (
    code: string,
    values: Partial<Link> = {},
  ): Promise<Link> =>
    harness.dataSource.getRepository(Link).save({
      workspaceId: fixture.workspace.id,
      domainId: fixture.domain.id,
      code,
      destinationUrl: CLEAN,
      ...values,
    });
  const insertVariant = (link: Link, values: Partial<LinkVariant>) =>
    harness.dataSource.getRepository(LinkVariant).save({
      linkId: link.id,
      name: 'B',
      destinationUrl: BAD,
      weight: 10,
      ...values,
    });
  const statuses = async (): Promise<Record<string, string>> =>
    Object.fromEntries(
      (await harness.dataSource.getRepository(Link).find()).map((link) => [
        link.code,
        link.status,
      ]),
    );
  const run = (): Promise<number> => harness.app.get(BlocklistRecheckJob).run();

  beforeAll(async () => {
    harness = await createLinksHarness();
  });

  beforeEach(async () => {
    await resetState(harness.app);
    harness.forget();
    fixture = await createWorkspaceFixture(harness.app);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('blocks links whose destination is now on the blocklist', async () => {
    await insertLink('clean');
    await insertLink('bad', { destinationUrl: BAD });
    await insertLink('apex', { destinationUrl: `http://${BLOCKED_HOST}/` });
    await insertLink('badOff', {
      destinationUrl: BAD,
      status: StoredLinkStatus.Disabled,
    });
    await insertLink('lookalike', {
      destinationUrl: `https://not${BLOCKED_HOST}/?next=${BLOCKED_HOST}`,
    });

    const blocked = await run();

    expect(blocked).toBe(3);
    expect(await statuses()).toEqual({
      clean: 'ACTIVE',
      bad: 'BLOCKED',
      apex: 'BLOCKED',
      badOff: 'BLOCKED',
      lookalike: 'ACTIVE',
    });
  });

  it('blocks a link that serves a blocklisted variant, not an archived one', async () => {
    await insertVariant(await insertLink('testing'), {});
    await insertVariant(await insertLink('ended'), { archivedAt: new Date() });

    await run();

    expect(await statuses()).toEqual({ testing: 'BLOCKED', ended: 'ACTIVE' });
  });

  it('invalidates the redirect cache and audits each block as the system', async () => {
    const bad = await insertLink('bad', { destinationUrl: BAD });

    await run();

    expect(harness.invalidations).toEqual([
      { hostname: 'sho.test', code: 'bad' },
    ]);
    expect(harness.auditEntries).toEqual([
      {
        workspaceId: fixture.workspace.id,
        actor: { type: 'system', id: null },
        action: 'link.blocked',
        target: { type: 'link', id: bad.id },
        metadata: { reason: 'blocklist' },
      },
    ]);
  });

  it('leaves `updated_at` alone: a takedown is not an edit', async () => {
    const bad = await insertLink('bad', { destinationUrl: BAD });

    await run();

    const row = await harness.dataSource
      .getRepository(Link)
      .findOneByOrFail({ id: bad.id });
    expect(row.status).toBe('BLOCKED');
    expect(row.updatedAt).toEqual(bad.updatedAt);
  });

  it('does not block a link whose audit entry cannot be written, and carries on', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const first = await insertLink('first', { destinationUrl: BAD });
    await insertLink('second', { destinationUrl: BAD });
    harness.failAuditFor(first.id);

    const blocked = await run();

    expect(blocked).toBe(1);
    expect(await statuses()).toEqual({ first: 'ACTIVE', second: 'BLOCKED' });
    expect(harness.invalidations).toEqual([
      { hostname: 'sho.test', code: 'second' },
    ]);

    harness.failAuditFor(null);
    expect(await run()).toBe(1);
    expect(await statuses()).toEqual({ first: 'BLOCKED', second: 'BLOCKED' });
  });

  it('is safe to repeat', async () => {
    await insertLink('bad', { destinationUrl: BAD });
    await run();
    harness.forget();

    const blocked = await run();

    expect(blocked).toBe(0);
    expect(harness.invalidations).toEqual([]);
    expect(harness.auditEntries).toEqual([]);
  });

  it('walks more links than fit in one batch', async () => {
    const rows = Array.from({ length: 1_203 }, (_unused, index) => ({
      workspaceId: fixture.workspace.id,
      domainId: fixture.domain.id,
      code: `code${index}`,
      destinationUrl: index % 400 === 0 ? BAD : CLEAN,
    }));
    await harness.dataSource.getRepository(Link).insert(rows);

    const blocked = await run();

    expect(blocked).toBe(4);
    expect(
      await harness.dataSource
        .getRepository(Link)
        .countBy({ status: StoredLinkStatus.Blocked }),
    ).toBe(4);
  });

  it('does nothing without a blocklist', async () => {
    const unlisted = await createLinksHarness(undefined, []);
    try {
      await insertLink('bad', { destinationUrl: BAD });

      const blocked = await unlisted.app.get(BlocklistRecheckJob).run();

      expect(blocked).toBe(0);
      expect(await statuses()).toEqual({ bad: 'ACTIVE' });
    } finally {
      await unlisted.app.close();
    }
  });
});

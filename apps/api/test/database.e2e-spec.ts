import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isDatabaseUnavailable } from '../src/database/database-unavailable.js';
import {
  Domain,
  DomainStatus,
  SERVING_HOSTNAME_UNIQUE_INDEX,
} from '../src/database/entities/domain.entity.js';
import { LinkDailyTotal } from '../src/database/entities/link-daily-total.entity.js';
import { LinkVariant } from '../src/database/entities/link-variant.entity.js';
import {
  LINK_CODE_UNIQUE_CONSTRAINT,
  Link,
} from '../src/database/entities/link.entity.js';
import { User } from '../src/database/entities/user.entity.js';
import { Workspace } from '../src/database/entities/workspace.entity.js';
import { createTestApp } from './support/create-test-app.js';
import {
  createWorkspaceFixture,
  type WorkspaceFixture,
} from './support/fixtures.js';
import { resetState } from './support/reset-state.js';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const RESTRICT_VIOLATION = '23001';
const MAX_URL_LENGTH = 2048;
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A port nothing listens on, so connections are refused immediately. */
const UNREACHABLE_DATABASE_URL = 'postgres://nobody@localhost:1/nowhere';

describe('database schema', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let fixture: WorkspaceFixture;

  const insertLink = (values: Partial<Link>): Promise<Link> =>
    dataSource.getRepository(Link).save({
      workspaceId: fixture.workspace.id,
      domainId: fixture.domain.id,
      destinationUrl: 'https://example.com/landing',
      ...values,
    });

  const insertClick = (eventId: string, linkId: string): Promise<unknown> =>
    dataSource.query(
      `INSERT INTO "click_events"
         ("event_id", "clicked_at", "link_id", "source", "country",
          "device_type", "os", "browser")
       VALUES ($1, '2026-11-27T12:00:00Z', $2, 'link', 'DE', 'mobile', 'iOS', 'Safari')
       ON CONFLICT ("event_id", "clicked_at") DO NOTHING`,
      [eventId, linkId],
    );

  const count = async (table: string): Promise<number> => {
    const rows: Array<{ count: string }> = await dataSource.query(
      `SELECT count(*) FROM "${table}"`,
    );
    return Number(rows[0]?.count);
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(app);
    fixture = await createWorkspaceFixture(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('is exactly what the entities describe', async () => {
    const drift = await dataSource.driver.createSchemaBuilder().log();

    expect(drift.upQueries.map(({ query }) => query)).toEqual([]);
  });

  it('gives new rows a time-ordered UUID', async () => {
    const first = await insertLink({ code: 'first01' });
    const second = await insertLink({ code: 'second2' });

    expect(first.id).toMatch(UUID_V7);
    expect(second.id > first.id).toBe(true);
  });

  describe('users', () => {
    const insertUser = (email: string): Promise<User> =>
      dataSource
        .getRepository(User)
        .save({ email, name: 'Ada', passwordHash: 'hash' });

    it('rejects a second account with the same email', async () => {
      await insertUser('ada@example.com');

      await expect(insertUser('ada@example.com')).rejects.toMatchObject({
        driverError: { code: UNIQUE_VIOLATION, constraint: 'uq_users_email' },
      });
    });

    it('rejects an email that is not stored lowercase', async () => {
      await expect(insertUser('Ada@Example.com')).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
    });
  });

  describe('links', () => {
    it('fills in the defaults of a new link', async () => {
      const { id } = await insertLink({ code: 'aB92xK7' });

      const link = await dataSource.getRepository(Link).findOneByOrFail({ id });

      expect(link).toMatchObject({
        code: 'aB92xK7',
        destinationUrl: 'https://example.com/landing',
        title: null,
        status: 'ACTIVE',
        expiresAt: null,
        qrStyle: null,
        clickCount: '0',
        createdByUserId: null,
      });
      expect(link.createdAt).toBeInstanceOf(Date);
    });

    it('rejects a second link with the same code on the same domain, naming the constraint', async () => {
      await insertLink({ code: 'launch' });

      await expect(insertLink({ code: 'launch' })).rejects.toMatchObject({
        driverError: {
          code: UNIQUE_VIOLATION,
          constraint: LINK_CODE_UNIQUE_CONSTRAINT,
        },
      });
    });

    it('allows the same code on a different domain', async () => {
      const customDomain = await dataSource.getRepository(Domain).save({
        workspaceId: fixture.workspace.id,
        hostname: 'go.brand.test',
        status: DomainStatus.Active,
        verificationToken: 'token',
      });
      await insertLink({ code: 'launch' });

      await expect(
        insertLink({ code: 'launch', domainId: customDomain.id }),
      ).resolves.toBeDefined();
    });

    it('treats codes as case-sensitive', async () => {
      await insertLink({ code: 'aB92xK7' });

      await expect(insertLink({ code: 'Ab92Xk7' })).resolves.toBeDefined();
    });

    it('rejects a stored status other than ACTIVE, DISABLED, or BLOCKED', async () => {
      const invalid = insertLink({
        code: 'aB92xK7',
        status: 'EXPIRED' as Link['status'],
      });

      await expect(invalid).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
    });

    it('accepts a destination of exactly the maximum length', async () => {
      const destinationUrl = 'https://example.com/'.padEnd(MAX_URL_LENGTH, 'a');

      await expect(
        insertLink({ code: 'aB92xK7', destinationUrl }),
      ).resolves.toBeDefined();
    });

    it('rejects a destination one character over the maximum', async () => {
      const destinationUrl = 'https://example.com/'.padEnd(
        MAX_URL_LENGTH + 1,
        'a',
      );

      await expect(
        insertLink({ code: 'aB92xK7', destinationUrl }),
      ).rejects.toMatchObject({ driverError: { code: CHECK_VIOLATION } });
    });

    it('keeps a domain from being removed while links live on it', async () => {
      await insertLink({ code: 'aB92xK7' });

      const removal = dataSource
        .getRepository(Domain)
        .delete({ id: fixture.domain.id });

      await expect(removal).rejects.toMatchObject({
        driverError: { code: RESTRICT_VIOLATION },
      });
    });

    it('is removed together with its workspace', async () => {
      await insertLink({ code: 'aB92xK7' });

      await dataSource
        .getRepository(Workspace)
        .delete({ id: fixture.workspace.id });

      expect(await count('links')).toBe(0);
    });
  });

  describe('domains', () => {
    const claim = (workspaceId: string, status: DomainStatus) =>
      dataSource.getRepository(Domain).save({
        workspaceId,
        hostname: 'go.brand.test',
        status,
        verificationToken: 'token',
      });

    it('lets two workspaces hold an unverified claim to the same host', async () => {
      const other = await createWorkspaceFixture(app);
      await claim(fixture.workspace.id, DomainStatus.Pending);

      await expect(
        claim(other.workspace.id, DomainStatus.Pending),
      ).resolves.toBeDefined();
    });

    it('lets only one claim to a host be active, naming the index', async () => {
      const other = await createWorkspaceFixture(app);
      await claim(fixture.workspace.id, DomainStatus.Active);

      await expect(
        claim(other.workspace.id, DomainStatus.Active),
      ).rejects.toMatchObject({
        driverError: {
          code: UNIQUE_VIOLATION,
          constraint: SERVING_HOSTNAME_UNIQUE_INDEX,
        },
      });
    });

    it('keeps a blocked host from being activated by anyone else', async () => {
      const other = await createWorkspaceFixture(app);
      await claim(fixture.workspace.id, DomainStatus.Blocked);

      await expect(
        claim(other.workspace.id, DomainStatus.Active),
      ).rejects.toMatchObject({ driverError: { code: UNIQUE_VIOLATION } });
    });

    it('rejects a second claim to a host by the same workspace', async () => {
      await claim(fixture.workspace.id, DomainStatus.Pending);

      await expect(
        claim(fixture.workspace.id, DomainStatus.Pending),
      ).rejects.toMatchObject({ driverError: { code: UNIQUE_VIOLATION } });
    });
  });

  describe('link_variants', () => {
    const insertVariant = (linkId: string, weight: number) =>
      dataSource.getRepository(LinkVariant).save({
        linkId,
        name: 'B',
        destinationUrl: 'https://example.com/b',
        weight,
      });

    it.each([0, 100])('rejects a weight of %i percent', async (weight) => {
      const link = await insertLink({ code: 'aB92xK7' });

      await expect(insertVariant(link.id, weight)).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
    });

    it('is removed together with its link', async () => {
      const link = await insertLink({ code: 'aB92xK7' });
      await insertVariant(link.id, 50);

      await dataSource.getRepository(Link).delete({ id: link.id });

      expect(await count('link_variants')).toBe(0);
    });
  });

  describe('analytics tables', () => {
    it('keeps one click when the same event is delivered twice', async () => {
      const link = await insertLink({ code: 'aB92xK7' });
      const eventId = randomUUID();

      await insertClick(eventId, link.id);
      await insertClick(eventId, link.id);

      expect(await count('click_events')).toBe(1);
    });

    it('keeps clicks after their link is deleted, to be dropped by retention', async () => {
      const link = await insertLink({ code: 'aB92xK7' });
      await insertClick(randomUUID(), link.id);

      await dataSource.getRepository(Link).delete({ id: link.id });

      expect(await count('click_events')).toBe(1);
    });

    it('removes roll-ups together with their link', async () => {
      const link = await insertLink({ code: 'aB92xK7' });
      await dataSource
        .getRepository(LinkDailyTotal)
        .save({ linkId: link.id, day: '2026-11-27', clicks: '3' });

      await dataSource.getRepository(Link).delete({ id: link.id });

      expect(await count('link_daily_totals')).toBe(0);
    });
  });

  describe('outage detection', () => {
    it('recognises a refused connection as an outage', async () => {
      const unreachable = new DataSource({
        type: 'postgres',
        url: UNREACHABLE_DATABASE_URL,
      });

      const failure: unknown = await unreachable
        .initialize()
        .catch((error: unknown) => error);

      expect(isDatabaseUnavailable(failure)).toBe(true);
    });

    it('recognises a statement cancelled by the timeout as an outage', async () => {
      const failure: unknown = await dataSource
        .transaction(async (manager) => {
          await manager.query('SET LOCAL statement_timeout = 50');
          await manager.query('SELECT pg_sleep(5)');
        })
        .catch((error: unknown) => error);

      expect(isDatabaseUnavailable(failure)).toBe(true);
    });

    it('does not treat a constraint violation as an outage', async () => {
      await insertLink({ code: 'launch' });

      const failure: unknown = await insertLink({ code: 'launch' }).catch(
        (error: unknown) => error,
      );

      expect(isDatabaseUnavailable(failure)).toBe(false);
    });
  });
});

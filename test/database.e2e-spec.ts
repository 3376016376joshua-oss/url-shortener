import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClickEvent } from '../src/database/entities/click-event.entity.js';
import {
  SHORT_CODE_UNIQUE_CONSTRAINT,
  UrlMapping,
} from '../src/database/entities/url-mapping.entity.js';
import { createTestApp } from './support/create-test-app.js';
import { resetState } from './support/reset-state.js';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const MAX_URL_LENGTH = 2048;

describe('database schema', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  const insertLink = (values: Partial<UrlMapping>): Promise<UrlMapping> =>
    dataSource.getRepository(UrlMapping).save({
      longUrl: 'https://example.com/landing',
      ownerId: null,
      expiresAt: null,
      ...values,
    });

  const insertClick = (eventId: string, linkId: string): Promise<unknown> =>
    dataSource.query(
      `INSERT INTO "click_events" ("event_id", "link_id", "clicked_at", "ua_class")
       VALUES ($1, $2, now(), 'desktop')
       ON CONFLICT ("event_id") DO NOTHING`,
      [eventId, linkId],
    );

  const countClicks = (): Promise<number> =>
    dataSource.getRepository(ClickEvent).count();

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('is exactly what the entities describe', async () => {
    const drift = await dataSource.driver.createSchemaBuilder().log();

    expect(drift.upQueries.map(({ query }) => query)).toEqual([]);
  });

  describe('url_mappings', () => {
    it('fills in the defaults of a new link', async () => {
      const { id } = await insertLink({ shortCode: 'aB92xK7' });

      const link = await dataSource
        .getRepository(UrlMapping)
        .findOneByOrFail({ id });

      expect(link).toMatchObject({
        shortCode: 'aB92xK7',
        longUrl: 'https://example.com/landing',
        ownerId: null,
        status: 'ACTIVE',
        expiresAt: null,
        clickCount: '0',
      });
      expect(link.createdAt).toBeInstanceOf(Date);
      expect(link.updatedAt).toBeInstanceOf(Date);
    });

    it('rejects a second link with the same short code, naming the constraint', async () => {
      await insertLink({ shortCode: 'launch' });

      await expect(insertLink({ shortCode: 'launch' })).rejects.toMatchObject({
        driverError: {
          code: UNIQUE_VIOLATION,
          constraint: SHORT_CODE_UNIQUE_CONSTRAINT,
        },
      });
    });

    it('treats short codes as case-sensitive', async () => {
      await insertLink({ shortCode: 'aB92xK7' });

      await expect(insertLink({ shortCode: 'Ab92Xk7' })).resolves.toBeDefined();
    });

    it('rejects a stored status other than ACTIVE or DISABLED', async () => {
      const invalid = insertLink({
        shortCode: 'aB92xK7',
        status: 'EXPIRED' as UrlMapping['status'],
      });

      await expect(invalid).rejects.toMatchObject({
        driverError: { code: CHECK_VIOLATION },
      });
    });

    it('accepts a long URL of exactly the maximum length', async () => {
      const longUrl = 'https://example.com/'.padEnd(MAX_URL_LENGTH, 'a');

      await expect(
        insertLink({ shortCode: 'aB92xK7', longUrl }),
      ).resolves.toBeDefined();
    });

    it('rejects a long URL one character over the maximum', async () => {
      const longUrl = 'https://example.com/'.padEnd(MAX_URL_LENGTH + 1, 'a');

      await expect(
        insertLink({ shortCode: 'aB92xK7', longUrl }),
      ).rejects.toMatchObject({ driverError: { code: CHECK_VIOLATION } });
    });
  });

  describe('click_events', () => {
    it('keeps one row when the same event is delivered twice', async () => {
      const link = await insertLink({ shortCode: 'aB92xK7' });
      const eventId = randomUUID();

      await insertClick(eventId, link.id);
      await insertClick(eventId, link.id);

      expect(await countClicks()).toBe(1);
    });

    it('is removed together with its link', async () => {
      const link = await insertLink({ shortCode: 'aB92xK7' });
      await insertClick(randomUUID(), link.id);

      await dataSource.getRepository(UrlMapping).delete({ id: link.id });

      expect(await countClicks()).toBe(0);
    });

    it('cannot reference a link that does not exist', async () => {
      await expect(insertClick(randomUUID(), '999999')).rejects.toMatchObject({
        driverError: { code: FOREIGN_KEY_VIOLATION },
      });
    });
  });
});

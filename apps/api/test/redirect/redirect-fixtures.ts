import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request, { type Test } from 'supertest';
import { DataSource } from 'typeorm';
import {
  Domain,
  DomainStatus,
} from '../../src/database/entities/domain.entity.js';
import { LinkVariant } from '../../src/database/entities/link-variant.entity.js';
import { Link } from '../../src/database/entities/link.entity.js';
import { Clock } from '../../src/redirect/clock.js';
import { testEnv } from '../support/test-env.js';

export const PLATFORM_HOST = testEnv.DEFAULT_SHORT_DOMAIN;

/** What a browser sends when someone follows a link. */
export const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

/** `GET /{path}` addressed to a short domain, as the edge would forward it. */
export function follow(
  app: NestExpressApplication,
  path: string,
  host: string = PLATFORM_HOST,
): Test {
  return request(app.getHttpServer()).get(`/${path}`).set('Host', host);
}

type LinkOverrides = Partial<
  Pick<Link, 'code' | 'destinationUrl' | 'status' | 'expiresAt'>
>;

let sequence = 0;

/** Inserts a link the way the links workstream stores one. */
export async function createLink(
  app: INestApplication,
  domain: Pick<Domain, 'id'>,
  workspaceId: string,
  overrides: LinkOverrides = {},
): Promise<Link> {
  sequence += 1;
  return app
    .get(DataSource)
    .getRepository(Link)
    .save({
      workspaceId,
      domainId: domain.id,
      code: `code${String(sequence).padStart(3, '0')}`,
      destinationUrl: `https://example.com/landing-${sequence}`,
      ...overrides,
    });
}

/** Inserts a custom domain claimed by a workspace. */
export async function createDomain(
  app: INestApplication,
  workspaceId: string,
  hostname: string,
  status: DomainStatus = DomainStatus.Active,
): Promise<Domain> {
  return app.get(DataSource).getRepository(Domain).save({
    workspaceId,
    hostname,
    status,
    verificationToken: 'sv_test',
  });
}

export async function createVariant(
  app: INestApplication,
  link: Pick<Link, 'id'>,
  variant: Pick<LinkVariant, 'name' | 'destinationUrl' | 'weight'> &
    Partial<Pick<LinkVariant, 'archivedAt' | 'createdAt'>>,
): Promise<LinkVariant> {
  return app
    .get(DataSource)
    .getRepository(LinkVariant)
    .save({ linkId: link.id, ...variant });
}

/** A clock a test can move: the real time until `set` is called. */
export class TestClock extends Clock {
  private fixed: Date | null = null;

  now(): Date {
    return this.fixed ?? new Date();
  }

  set(time: Date): void {
    this.fixed = time;
  }

  reset(): void {
    this.fixed = null;
  }
}

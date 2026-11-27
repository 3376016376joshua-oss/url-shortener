import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { DataSource } from 'typeorm';
import { AuditLog, type AuditEntry } from '../../src/audit/audit-log.js';
import {
  Domain,
  DomainStatus,
} from '../../src/database/entities/domain.entity.js';
import { WorkspaceRole } from '../../src/database/entities/workspace-member.entity.js';
import type { Env } from '../../src/config/env.schema.js';
import type { Principal } from '../../src/identity/principal.js';
import { LinkCacheInvalidator } from '../../src/link-cache/link-cache-invalidator.js';
import {
  DESTINATION_POLICY,
  buildDestinationPolicy,
} from '../../src/links/destination-policy.provider.js';
import { createTestApp } from '../support/create-test-app.js';
import { authenticatedAs, type WorkspaceFixture } from '../support/fixtures.js';

/** The operator's blocklist in every links suite. */
export const BLOCKED_HOST = 'blocked.test';

type Customize = (builder: TestingModuleBuilder) => TestingModuleBuilder;

export interface LinksHarness {
  app: NestExpressApplication;
  dataSource: DataSource;
  /** Every cache invalidation since the last `forget()`. */
  invalidations: Array<{ hostname: string; code: string }>;
  /** Every audit entry since the last `forget()`. */
  auditEntries: AuditEntry[];
  /** Who the next requests are made as; `null` is nobody. */
  signIn(principal: Principal | null): void;
  /** Clears what was recorded and signs out. Call between tests. */
  forget(): void;
  http(): TestAgent;
}

/**
 * Boots the application with the platform's other workstreams observed
 * rather than implemented: cache invalidations and audit entries are
 * recorded, and requests are signed in as whoever the test says.
 */
export async function createLinksHarness(
  customize: Customize = (builder) => builder,
  blockedHosts: string[] = [BLOCKED_HOST],
): Promise<LinksHarness> {
  let current: Principal | null = null;
  const invalidations: LinksHarness['invalidations'] = [];
  const auditEntries: AuditEntry[] = [];

  const app = await createTestApp((builder) =>
    customize(
      authenticatedAs(() => current)(builder)
        .overrideProvider(LinkCacheInvalidator)
        .useValue({
          invalidateLink: (hostname: string, code: string) => {
            invalidations.push({ hostname, code });
            return Promise.resolve();
          },
          invalidateDomain: () => Promise.resolve(),
        })
        .overrideProvider(DESTINATION_POLICY)
        .useFactory({
          inject: [ConfigService],
          factory: (config: ConfigService<Env, true>) => ({
            ...buildDestinationPolicy(config),
            blockedHosts,
          }),
        })
        .overrideProvider(AuditLog)
        .useValue({
          record: (entry: AuditEntry) => {
            auditEntries.push(entry);
            return Promise.resolve();
          },
        }),
    ),
  );

  return {
    app,
    dataSource: app.get(DataSource),
    invalidations,
    auditEntries,
    signIn: (principal) => {
      current = principal;
    },
    forget: () => {
      current = null;
      invalidations.length = 0;
      auditEntries.length = 0;
    },
    http: () => request(app.getHttpServer()),
  };
}

export const linksPath = (fixture: WorkspaceFixture): string =>
  `/api/v1/workspaces/${fixture.workspace.id}/links`;

/** A workspace API key: the member role, and no user behind it. */
export function apiKeyPrincipal(fixture: WorkspaceFixture): Principal {
  return {
    kind: 'api_key',
    userId: null,
    apiKeyId: '0193d2a2-0000-7000-8000-000000000001',
    isPlatformAdmin: false,
    memberships: [
      { workspaceId: fixture.workspace.id, role: WorkspaceRole.Member },
    ],
  };
}

/** A custom domain of the workspace, active unless said otherwise. */
export function insertDomain(
  harness: LinksHarness,
  fixture: WorkspaceFixture,
  hostname: string,
  status: DomainStatus = DomainStatus.Active,
): Promise<Domain> {
  return harness.dataSource.getRepository(Domain).save({
    workspaceId: fixture.workspace.id,
    hostname,
    status,
    verificationToken: `token-${hostname}`,
  });
}

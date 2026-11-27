import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { AuditLog, type AuditEntry } from '../../src/audit/audit-log.js';
import { User } from '../../src/database/entities/user.entity.js';
import type { Principal } from '../../src/identity/principal.js';
import { LinkCacheInvalidator } from '../../src/link-cache/link-cache-invalidator.js';
import { createTestApp } from '../support/create-test-app.js';
import {
  authenticatedAs,
  createWorkspaceFixture,
  type WorkspaceFixture,
} from '../support/fixtures.js';
import { resetState } from '../support/reset-state.js';

export const UNKNOWN_ID = '0198c0de-0000-7000-8000-00000000dead';

export interface AdminSuite {
  app: NestExpressApplication;
  dataSource: DataSource;
  /** Who the next request is signed in as; the platform admin by default. */
  caller: Principal | null;
  admin: Principal;
  /** An ordinary workspace, its owner, and the platform domain. */
  tenant: WorkspaceFixture;
  audit: {
    record: ReturnType<typeof vi.fn<(entry: AuditEntry) => Promise<void>>>;
  };
  cache: {
    invalidateLink: ReturnType<
      typeof vi.fn<(hostname: string, code: string) => Promise<void>>
    >;
    invalidateDomain: ReturnType<
      typeof vi.fn<(hostname: string) => Promise<void>>
    >;
  };
  post(path: string): request.Test;
}

/**
 * Boots the application for a platform admin suite, with the audit log and
 * the cache invalidator replaced by spies, and starts every test from a
 * clean database holding one tenant and one platform admin.
 */
export function setUpAdminSuite(): AdminSuite {
  const suite = {
    caller: null,
    audit: { record: vi.fn() },
    cache: { invalidateLink: vi.fn(), invalidateDomain: vi.fn() },
    post: (path: string) =>
      request(suite.app.getHttpServer()).post(`/api/v1/admin${path}`),
  } as unknown as AdminSuite;

  beforeAll(async () => {
    suite.app = await createTestApp((builder) =>
      authenticatedAs(() => suite.caller)(builder)
        .overrideProvider(AuditLog)
        .useValue(suite.audit)
        .overrideProvider(LinkCacheInvalidator)
        .useValue(suite.cache),
    );
    suite.dataSource = suite.app.get(DataSource);
  });

  beforeEach(async () => {
    await resetState(suite.app);
    vi.resetAllMocks();
    suite.audit.record.mockResolvedValue();
    suite.cache.invalidateLink.mockResolvedValue();
    suite.cache.invalidateDomain.mockResolvedValue();

    suite.tenant = await createWorkspaceFixture(suite.app);
    const operator = await suite.dataSource.getRepository(User).save({
      email: 'operator@shortener.test',
      name: 'Operator',
      passwordHash: 'not-a-real-hash',
      emailVerifiedAt: new Date(),
      isPlatformAdmin: true,
    });
    suite.admin = {
      kind: 'session',
      userId: operator.id,
      apiKeyId: null,
      isPlatformAdmin: true,
      memberships: [],
    };
    suite.caller = suite.admin;
  });

  afterAll(async () => {
    await suite.app.close();
  });

  return suite;
}

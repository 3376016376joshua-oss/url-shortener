import type { INestApplication } from '@nestjs/common';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  Domain,
  DomainStatus,
} from '../../src/database/entities/domain.entity.js';
import { User } from '../../src/database/entities/user.entity.js';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../../src/database/entities/workspace-member.entity.js';
import { Workspace } from '../../src/database/entities/workspace.entity.js';
import { Authenticator } from '../../src/identity/authenticator.js';
import type { Principal } from '../../src/identity/principal.js';
import { testEnv } from './test-env.js';

export interface WorkspaceFixture {
  user: User;
  workspace: Workspace;
  /** The platform short domain, active and usable by the workspace. */
  domain: Domain;
  /** The user, signed in, as the owner of the workspace. */
  principal: Principal;
}

let sequence = 0;

/**
 * Inserts what almost every feature test needs first: a user who owns a
 * workspace, and the platform's short domain. Call it again for a second,
 * unrelated tenant.
 */
export async function createWorkspaceFixture(
  app: INestApplication,
): Promise<WorkspaceFixture> {
  const dataSource = app.get(DataSource);
  sequence += 1;

  const user = await dataSource.getRepository(User).save({
    email: `user${sequence}@shortener.test`,
    name: `User ${sequence}`,
    passwordHash: 'not-a-real-hash',
    emailVerifiedAt: new Date(),
  });
  const workspace = await dataSource.getRepository(Workspace).save({
    name: `Workspace ${sequence}`,
    slug: `workspace-${sequence}`,
  });
  await dataSource.getRepository(WorkspaceMember).save({
    workspaceId: workspace.id,
    userId: user.id,
    role: WorkspaceRole.Owner,
  });
  const domains = dataSource.getRepository(Domain);
  const hostname = testEnv.DEFAULT_SHORT_DOMAIN;
  const domain =
    (await domains.findOneBy({ hostname })) ??
    (await domains.save({
      workspaceId: null,
      hostname,
      status: DomainStatus.Active,
      verificationToken: 'platform-domain',
      verifiedAt: new Date(),
    }));

  const principal: Principal = {
    kind: 'session',
    userId: user.id,
    apiKeyId: null,
    isPlatformAdmin: false,
    memberships: [{ workspaceId: workspace.id, role: WorkspaceRole.Owner }],
  };
  return { user, workspace, domain, principal };
}

/**
 * A `createTestApp` customisation that signs every request in as whoever
 * `current` returns at that moment (`null` for nobody). It stands in for
 * real sessions and API keys, so feature tests do not depend on them.
 */
export function authenticatedAs(
  current: () => Principal | null,
): (builder: TestingModuleBuilder) => TestingModuleBuilder {
  return (builder) =>
    builder
      .overrideProvider(Authenticator)
      .useValue({ authenticate: () => Promise.resolve(current()) });
}

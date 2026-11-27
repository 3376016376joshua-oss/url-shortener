import { Injectable } from '@nestjs/common';
import type {
  Identity,
  WorkspaceSummary,
} from '@url-shortener/contracts/identity';
import { DataSource, In } from 'typeorm';
import { ApiKey } from '../../database/entities/api-key.entity.js';
import { User } from '../../database/entities/user.entity.js';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity.js';
import { Workspace } from '../../database/entities/workspace.entity.js';
import type { Principal, WorkspaceMembership } from '../principal.js';

/** Builds the body of `GET /me`: who the caller is and where they belong. */
@Injectable()
export class IdentityReader {
  constructor(private readonly dataSource: DataSource) {}

  async describe(principal: Principal): Promise<Identity> {
    if (principal.kind === 'session' && principal.userId !== null) {
      return this.describeUser(principal.userId);
    }
    const apiKey = await this.dataSource
      .getRepository(ApiKey)
      .findOneByOrFail({ id: principal.apiKeyId ?? '' });
    return {
      kind: 'api_key',
      apiKey: { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix },
      workspaces: await this.summarise(principal.memberships),
    };
  }

  async describeUser(userId: string): Promise<Identity> {
    const [user, memberships] = await Promise.all([
      this.dataSource.getRepository(User).findOneByOrFail({ id: userId }),
      this.dataSource.getRepository(WorkspaceMember).findBy({ userId }),
    ]);
    return {
      kind: 'session',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
        createdAt: user.createdAt.toISOString(),
      },
      workspaces: await this.summarise(memberships),
    };
  }

  /** Oldest workspace first, so a user's first workspace leads the list. */
  private async summarise(
    memberships: ReadonlyArray<WorkspaceMembership>,
  ): Promise<WorkspaceSummary[]> {
    const roles = new Map(
      memberships.map(({ workspaceId, role }) => [workspaceId, role]),
    );
    const workspaces = await this.dataSource.getRepository(Workspace).find({
      where: { id: In([...roles.keys()]) },
      order: { id: 'ASC' },
    });
    return workspaces.flatMap((workspace) => {
      const role = roles.get(workspace.id);
      return role === undefined
        ? []
        : [
            {
              id: workspace.id,
              name: workspace.name,
              slug: workspace.slug,
              role,
            },
          ];
    });
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import type { Env } from '../config/env.schema.js';
import { ApiKey } from '../database/entities/api-key.entity.js';
import { User } from '../database/entities/user.entity.js';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../database/entities/workspace-member.entity.js';
import {
  isWellFormedApiKey,
  readBearerToken,
} from './api-keys/api-key-format.js';
import { Authenticator } from './authenticator.js';
import { Clock } from './clock.js';
import { assertSameOrigin } from './origin-check.js';
import type { Principal } from './principal.js';
import { setCurrentSessionId } from './sessions/current-session.js';
import { readSessionToken } from './sessions/session-cookie.js';
import { Sessions } from './sessions/sessions.js';
import { hashSecret } from './tokens/secret-token.js';

/** `last_used_at` of a key is written at most this often. */
const LAST_USED_RESOLUTION_MS = 60_000;

/** Recognises a workspace API key or a session cookie (PRD section 6). */
@Injectable()
export class CredentialAuthenticator extends Authenticator {
  private readonly appUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly dataSource: DataSource,
    private readonly sessions: Sessions,
    private readonly clock: Clock,
  ) {
    super();
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /**
   * A bearer token is an explicit choice of credential, so when one is sent
   * the cookie is not consulted, even if the token turns out to be invalid.
   */
  async authenticate(request: Request): Promise<Principal | null> {
    const bearerToken = readBearerToken(request);
    if (bearerToken !== null) {
      return this.authenticateApiKey(bearerToken);
    }
    const sessionToken = readSessionToken(request);
    if (sessionToken === null) {
      return null;
    }
    const principal = await this.authenticateSession(sessionToken, request);
    if (principal !== null) {
      // Only cookies need this: a browser never attaches an API key itself.
      assertSameOrigin(request, this.appUrl);
    }
    return principal;
  }

  private async authenticateSession(
    token: string,
    request: Request,
  ): Promise<Principal | null> {
    const session = await this.sessions.resolve(token);
    if (session === null) {
      return null;
    }
    const [user, memberships] = await Promise.all([
      this.dataSource.getRepository(User).findOneBy({ id: session.userId }),
      this.dataSource
        .getRepository(WorkspaceMember)
        .findBy({ userId: session.userId }),
    ]);
    // A platform admin disabling an account ends its sessions at once.
    if (user === null || user.disabledAt !== null) {
      return null;
    }
    setCurrentSessionId(request, session.id);
    return {
      kind: 'session',
      userId: user.id,
      apiKeyId: null,
      isPlatformAdmin: user.isPlatformAdmin,
      memberships: memberships.map(({ workspaceId, role }) => ({
        workspaceId,
        role,
      })),
    };
  }

  private async authenticateApiKey(key: string): Promise<Principal | null> {
    if (!isWellFormedApiKey(key)) {
      return null;
    }
    const apiKeys = this.dataSource.getRepository(ApiKey);
    const apiKey = await apiKeys.findOneBy({ keyHash: hashSecret(key) });
    const now = this.clock.now();
    if (
      apiKey === null ||
      apiKey.revokedAt !== null ||
      (apiKey.expiresAt !== null && apiKey.expiresAt.getTime() <= now.getTime())
    ) {
      return null;
    }
    const lastUsed = apiKey.lastUsedAt?.getTime() ?? 0;
    if (now.getTime() - lastUsed >= LAST_USED_RESOLUTION_MS) {
      await apiKeys.update({ id: apiKey.id }, { lastUsedAt: now });
    }
    return {
      kind: 'api_key',
      userId: null,
      apiKeyId: apiKey.id,
      isPlatformAdmin: false,
      memberships: [
        { workspaceId: apiKey.workspaceId, role: WorkspaceRole.Member },
      ],
    };
  }
}

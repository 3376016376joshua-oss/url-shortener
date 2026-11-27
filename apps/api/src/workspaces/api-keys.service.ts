import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import {
  WorkspaceQuota,
  type ApiKeyList,
  type ApiKeySummary,
  type CreateApiKeyRequest,
  type CreatedApiKey,
} from '@url-shortener/contracts/workspaces';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { userActor } from '../audit/audit-actor.js';
import { AuditLog } from '../audit/audit-log.js';
import { ApiException } from '../common/errors/api-exception.js';
import { ApiKey } from '../database/entities/api-key.entity.js';
import { generateApiKey } from '../identity/api-keys/api-key-format.js';
import { Clock } from '../identity/clock.js';
import { notFound, quotaExceeded } from './workspace-errors.js';
import { lockWorkspace } from './workspace-lock.js';

const toSummary = (apiKey: ApiKey): ApiKeySummary => ({
  id: apiKey.id,
  name: apiKey.name,
  keyPrefix: apiKey.keyPrefix,
  createdByUserId: apiKey.createdByUserId,
  lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
  expiresAt: apiKey.expiresAt?.toISOString() ?? null,
  createdAt: apiKey.createdAt.toISOString(),
});

/** Workspace API keys: shown once, stored hashed (PRD section 6, ID-7). */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
    private readonly auditLog: AuditLog,
  ) {}

  /** The keys that have not been revoked, newest first. */
  async list(workspaceId: string): Promise<ApiKeyList> {
    const apiKeys = await this.dataSource.getRepository(ApiKey).find({
      where: { workspaceId, revokedAt: IsNull() },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return { items: apiKeys.map(toSummary), nextCursor: null };
  }

  async create(
    workspaceId: string,
    request: CreateApiKeyRequest,
    creatorUserId: string,
  ): Promise<CreatedApiKey> {
    const expiresAt = this.parseExpiry(request.expiresAt);
    const { key, keyPrefix, keyHash } = generateApiKey();
    const apiKey = await this.dataSource.transaction(async (manager) => {
      await lockWorkspace(manager, workspaceId);
      const apiKeys = manager.getRepository(ApiKey);
      const existing = await apiKeys.countBy({
        workspaceId,
        revokedAt: IsNull(),
      });
      if (existing >= WorkspaceQuota.ApiKeys) {
        throw quotaExceeded(
          `A workspace can have at most ${WorkspaceQuota.ApiKeys} API keys`,
        );
      }
      const saved = await apiKeys.save({
        workspaceId,
        name: request.name,
        keyPrefix,
        keyHash,
        createdByUserId: creatorUserId,
        expiresAt,
      });
      await this.audit(
        manager,
        workspaceId,
        creatorUserId,
        'api_key.created',
        saved,
      );
      return saved;
    });
    return { ...toSummary(apiKey), lastUsedAt: null, key };
  }

  async revoke(
    workspaceId: string,
    apiKeyId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const apiKeys = manager.getRepository(ApiKey);
      const apiKey = await apiKeys.findOneBy({
        id: apiKeyId,
        workspaceId,
        revokedAt: IsNull(),
      });
      if (apiKey === null) {
        throw notFound('API key');
      }
      await apiKeys.update({ id: apiKey.id }, { revokedAt: this.clock.now() });
      await this.audit(
        manager,
        workspaceId,
        actorUserId,
        'api_key.revoked',
        apiKey,
      );
    });
  }

  private parseExpiry(expiresAt: string | null | undefined): Date | null {
    if (expiresAt === null || expiresAt === undefined) {
      return null;
    }
    const expiry = new Date(expiresAt);
    if (expiry.getTime() <= this.clock.now().getTime()) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.ValidationFailed,
        'expiresAt: must be in the future',
      );
    }
    return expiry;
  }

  private audit(
    manager: EntityManager,
    workspaceId: string,
    actorUserId: string,
    action: string,
    apiKey: ApiKey,
  ): Promise<void> {
    return this.auditLog.record(
      {
        workspaceId,
        actor: userActor(actorUserId),
        action,
        target: { type: 'api_key', id: apiKey.id },
        metadata: { name: apiKey.name, keyPrefix: apiKey.keyPrefix },
      },
      manager,
    );
  }
}

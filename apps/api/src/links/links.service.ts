import { Injectable } from '@nestjs/common';
import type {
  LinkResponse,
  UpdateLinkRequest,
} from '@url-shortener/contracts/links';
import { DataSource } from 'typeorm';
import { Link } from '../database/entities/link.entity.js';
import type { Principal } from '../identity/principal.js';
import { DestinationRiskCheck } from './destination-risk-check.js';
import { destinationHost } from './destination-policy.js';
import { LinkChangePublisher, actorOf } from './link-change-publisher.js';
import { linkNotFound } from './link-errors.js';
import { lockEditableLink } from './link-lock.js';
import { LinkPresenter } from './link-presenter.js';

/** The link's columns a request may set, from the fields it actually sent. */
function toColumnChanges(request: UpdateLinkRequest): Partial<Link> {
  const changes: Partial<Link> = {};
  if (request.destinationUrl !== undefined) {
    changes.destinationUrl = request.destinationUrl;
  }
  if (request.title !== undefined) {
    changes.title = request.title;
  }
  if (request.expiresAt !== undefined) {
    changes.expiresAt =
      request.expiresAt === null ? null : new Date(request.expiresAt);
  }
  if (request.status !== undefined) {
    changes.status = request.status;
  }
  return changes;
}

/** Reading, editing, and deleting a workspace's links (PRD section 7). */
@Injectable()
export class LinksService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly riskCheck: DestinationRiskCheck,
    private readonly presenter: LinkPresenter,
    private readonly publisher: LinkChangePublisher,
  ) {}

  async get(workspaceId: string, linkId: string): Promise<LinkResponse> {
    return this.presenter.presentOne(await this.find(workspaceId, linkId));
  }

  /** A link of the workspace, for reading. Fails with 404 when absent. */
  async find(workspaceId: string, linkId: string): Promise<Link> {
    const link = await this.dataSource
      .getRepository(Link)
      .findOneBy({ id: linkId, workspaceId });
    if (link === null) {
      throw linkNotFound();
    }
    return link;
  }

  async update(
    workspaceId: string,
    linkId: string,
    request: UpdateLinkRequest,
    principal: Principal,
  ): Promise<LinkResponse> {
    if (request.destinationUrl !== undefined) {
      await this.riskCheck.assertAllowed(request.destinationUrl);
    }
    const changes = toColumnChanges(request);
    const link = await this.dataSource.transaction(async (manager) => {
      const locked = await lockEditableLink(manager, workspaceId, linkId);
      return manager.save(Object.assign(locked, changes));
    });

    await this.publisher.publish(link, {
      actor: actorOf(principal),
      action: 'link.updated',
      target: { type: 'link', id: link.id },
      metadata: {
        fields: Object.keys(changes),
        ...(changes.destinationUrl !== undefined && {
          destinationHost: destinationHost(changes.destinationUrl),
        }),
        ...(changes.status !== undefined && { status: changes.status }),
      },
    });
    return this.presenter.presentOne(link);
  }

  /** Variants and roll-ups go with the row; the code is free again. */
  async delete(
    workspaceId: string,
    linkId: string,
    principal: Principal,
  ): Promise<void> {
    const link = await this.dataSource.transaction(async (manager) => {
      const locked = await lockEditableLink(manager, workspaceId, linkId);
      await manager.delete(Link, { id: locked.id });
      return locked;
    });

    await this.publisher.publish(link, {
      actor: actorOf(principal),
      action: 'link.deleted',
      target: { type: 'link', id: link.id },
      metadata: { code: link.code, domainId: link.domainId },
    });
  }
}

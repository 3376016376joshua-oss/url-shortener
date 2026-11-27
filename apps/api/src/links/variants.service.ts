import { Injectable } from '@nestjs/common';
import type {
  CreateVariantRequest,
  LinkResponse,
  UpdateVariantRequest,
  VariantListResponse,
  VariantResponse,
} from '@url-shortener/contracts/links';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { LinkVariant } from '../database/entities/link-variant.entity.js';
import type { Principal } from '../identity/principal.js';
import { DestinationRiskCheck } from './destination-risk-check.js';
import { destinationHost } from './destination-policy.js';
import { LinkChangePublisher, actorOf } from './link-change-publisher.js';
import { variantNotFound } from './link-errors.js';
import { lockEditableLink, type LockedLink } from './link-lock.js';
import { LinkPresenter } from './link-presenter.js';
import { LinksService } from './links.service.js';
import {
  assertNotArchived,
  assertRoomForVariant,
  assertWeightsFit,
  toVariantResponse,
} from './variant-rules.js';

/** Names one variant of one link of one workspace. */
export interface VariantRef {
  workspaceId: string;
  linkId: string;
  variantId: string;
}

interface Changed extends LockedLink {
  variant: LinkVariant;
}

function findActiveVariants(
  manager: EntityManager,
  linkId: string,
): Promise<LinkVariant[]> {
  return manager.findBy(LinkVariant, { linkId, archivedAt: IsNull() });
}

/** A/B test variants of a link (PRD section 11, AB-1 and AB-5). */
@Injectable()
export class VariantsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly links: LinksService,
    private readonly riskCheck: DestinationRiskCheck,
    private readonly presenter: LinkPresenter,
    private readonly publisher: LinkChangePublisher,
  ) {}

  /** Every variant the link ever had, oldest first, archived included. */
  async list(
    workspaceId: string,
    linkId: string,
  ): Promise<VariantListResponse> {
    const link = await this.links.find(workspaceId, linkId);
    const variants = await this.dataSource.getRepository(LinkVariant).find({
      where: { linkId: link.id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return { items: variants.map(toVariantResponse), nextCursor: null };
  }

  async create(
    workspaceId: string,
    linkId: string,
    request: CreateVariantRequest,
    principal: Principal,
  ): Promise<VariantResponse> {
    await this.riskCheck.assertAllowed(request.destinationUrl);
    const changed = await this.dataSource.transaction(async (manager) => {
      const locked = await lockEditableLink(manager, workspaceId, linkId);
      const active = await findActiveVariants(manager, locked.link.id);
      assertRoomForVariant(active);
      assertWeightsFit([...active.map(({ weight }) => weight), request.weight]);
      const variant = await manager.save(
        manager.create(LinkVariant, { ...request, linkId: locked.link.id }),
      );
      return { ...locked, variant };
    });
    await this.publish(changed, principal, 'variant.created', {
      weight: changed.variant.weight,
      destinationHost: destinationHost(changed.variant.destinationUrl),
    });
    return toVariantResponse(changed.variant);
  }

  async update(
    ref: VariantRef,
    request: UpdateVariantRequest,
    principal: Principal,
  ): Promise<VariantResponse> {
    if (request.destinationUrl !== undefined) {
      await this.riskCheck.assertAllowed(request.destinationUrl);
    }
    const changed = await this.dataSource.transaction(async (manager) => {
      const locked = await lockEditableLink(
        manager,
        ref.workspaceId,
        ref.linkId,
      );
      const { link } = locked;
      const active = await findActiveVariants(manager, link.id);
      const variant = await this.findVariant(manager, ref);
      assertNotArchived(variant);
      Object.assign(
        variant,
        Object.fromEntries(
          Object.entries(request).filter(([, value]) => value !== undefined),
        ),
      );
      assertWeightsFit(
        active.map((other) =>
          other.id === variant.id ? variant.weight : other.weight,
        ),
      );
      return { ...locked, variant: await manager.save(variant) };
    });
    await this.publish(changed, principal, 'variant.updated', {
      fields: Object.keys(request),
      weight: changed.variant.weight,
    });
    return toVariantResponse(changed.variant);
  }

  /** The variant's traffic returns to the control. Safe to repeat. */
  async archive(
    ref: VariantRef,
    principal: Principal,
  ): Promise<VariantResponse> {
    const changed = await this.dataSource.transaction(async (manager) => {
      const locked = await lockEditableLink(
        manager,
        ref.workspaceId,
        ref.linkId,
      );

      const variant = await this.findVariant(manager, ref);
      if (variant.archivedAt !== null) {
        return { variant, archivedNow: null };
      }
      variant.archivedAt = new Date();
      await manager.save(variant);
      return { variant, archivedNow: { ...locked, variant } };
    });
    // Archiving again changes nothing, so there is nothing to publish.
    if (changed.archivedNow !== null) {
      await this.publish(
        changed.archivedNow,
        principal,
        'variant.archived',
        {},
      );
    }
    return toVariantResponse(changed.variant);
  }

  /**
   * Ends the test: the variant's destination becomes the link's, and every
   * variant is archived, keeping its name and history.
   */
  async promote(ref: VariantRef, principal: Principal): Promise<LinkResponse> {
    const changed = await this.dataSource.transaction(async (manager) => {
      const locked = await lockEditableLink(
        manager,
        ref.workspaceId,
        ref.linkId,
      );
      const { link } = locked;
      const variant = await this.findVariant(manager, ref);
      assertNotArchived(variant);
      // The link's destination changes, so the check applies as on any edit.
      await this.riskCheck.assertAllowed(variant.destinationUrl, manager);
      link.destinationUrl = variant.destinationUrl;
      await manager.save(link);
      const archivedAt = new Date();
      await manager.update(
        LinkVariant,
        { linkId: link.id, archivedAt: IsNull() },
        { archivedAt },
      );
      variant.archivedAt = archivedAt;
      return { ...locked, variant };
    });
    await this.publish(changed, principal, 'variant.promoted', {
      destinationHost: destinationHost(changed.link.destinationUrl),
    });
    return this.presenter.presentOne(changed.link);
  }

  private async findVariant(
    manager: EntityManager,
    ref: VariantRef,
  ): Promise<LinkVariant> {
    const variant = await manager.findOneBy(LinkVariant, {
      id: ref.variantId,
      linkId: ref.linkId,
    });
    if (variant === null) {
      throw variantNotFound();
    }
    return variant;
  }

  private publish(
    { link, hostname, variant }: Changed,
    principal: Principal,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.publisher.publish(link, hostname, {
      actor: actorOf(principal),
      action,
      target: { type: 'variant', id: variant.id },
      metadata: { linkId: link.id, name: variant.name, ...metadata },
    });
  }
}

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  DataSource,
  In,
  IsNull,
  MoreThan,
  Not,
  type EntityManager,
} from 'typeorm';
import { JobScheduler } from '../common/jobs/job-scheduler.js';
import { StoredLinkStatus } from '../common/link/link-state.js';
import { LinkVariant } from '../database/entities/link-variant.entity.js';
import { Link } from '../database/entities/link.entity.js';
import {
  destinationHost,
  isHostOrSubdomainOf,
  type DestinationPolicy,
} from './destination-policy.js';
import { DESTINATION_POLICY } from './destination-policy.provider.js';
import { LinkChangePublisher, SYSTEM_ACTOR } from './link-change-publisher.js';
import { lockLink } from './link-lock.js';

const JOB_NAME = 'links-blocklist-recheck';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Rows read per query, small enough to stay far inside the statement timeout. */
const BATCH_SIZE = 500;

/**
 * Re-runs the operator's blocklist over existing links every day and blocks
 * the matches, so a destination that turns bad after the link was created
 * does not keep working (PRD section 13).
 */
@Injectable()
export class BlocklistRecheckJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(BlocklistRecheckJob.name);

  constructor(
    @Inject(DESTINATION_POLICY) private readonly policy: DestinationPolicy,
    private readonly dataSource: DataSource,
    private readonly scheduler: JobScheduler,
    private readonly publisher: LinkChangePublisher,
  ) {}

  onApplicationBootstrap(): void {
    this.scheduler.register({
      name: JOB_NAME,
      everyMs: DAY_MS,
      run: async () => {
        await this.run();
      },
    });
  }

  /**
   * Walks every link that is not blocked yet, in id order, and returns how
   * many it blocked. Safe to repeat: a blocked link is never visited again,
   * and one that could not be blocked is still there for the next run.
   *
   * It also blocks again a link a platform admin unblocked while its host is
   * still on the blocklist: the blocklist is the operator's standing order.
   */
  async run(): Promise<number> {
    if (this.policy.blockedHosts.length === 0) {
      return 0;
    }
    let blocked = 0;
    let lastId: string | null = null;
    for (;;) {
      const batch: Link[] = await this.dataSource.getRepository(Link).find({
        where: {
          status: Not(StoredLinkStatus.Blocked),
          ...(lastId !== null && { id: MoreThan(lastId) }),
        },
        order: { id: 'ASC' },
        take: BATCH_SIZE,
      });
      const last = batch.at(-1);
      if (last === undefined) {
        break;
      }
      for (const link of await this.findMatches(batch)) {
        blocked += (await this.blockAndCarryOn(link)) ? 1 : 0;
      }
      lastId = last.id;
    }
    if (blocked > 0) {
      this.logger.warn(
        `Blocked ${blocked} links with blocklisted destinations`,
      );
    }
    return blocked;
  }

  /** One link that cannot be blocked must not shield the rest of the walk. */
  private async blockAndCarryOn(link: Link): Promise<boolean> {
    try {
      return await this.block(link);
    } catch (error) {
      this.logger.error(`Could not block link ${link.id}: ${String(error)}`);
      return false;
    }
  }

  /** A link matches through its own destination or any variant it serves. */
  private async findMatches(
    batch: ReadonlyArray<Link>,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Link[]> {
    const variants = await manager.find(LinkVariant, {
      where: { linkId: In(batch.map(({ id }) => id)), archivedAt: IsNull() },
      select: { linkId: true, destinationUrl: true },
    });
    const matchingLinkIds = new Set(
      variants
        .filter(({ destinationUrl }) => this.isBlocklisted(destinationUrl))
        .map(({ linkId }) => linkId),
    );
    return batch.filter(
      (link) =>
        matchingLinkIds.has(link.id) || this.isBlocklisted(link.destinationUrl),
    );
  }

  private isBlocklisted(destinationUrl: string): boolean {
    return isHostOrSubdomainOf(
      destinationHost(destinationUrl),
      this.policy.blockedHosts,
    );
  }

  /**
   * Blocks one link, and says whether it did. The batch was read without a
   * lock, so the link is judged again under its row lock: it may have been
   * cleaned up, blocked, or deleted since. The audit entry is written before
   * the commit, so a block that cannot be audited is rolled back and found
   * again by the next run instead of staying blocked and unrecorded.
   */
  private async block(candidate: Link): Promise<boolean> {
    const blocked = await this.dataSource.transaction(async (manager) => {
      const locked = await lockLink(manager, { id: candidate.id });
      if (
        locked === null ||
        locked.link.status === StoredLinkStatus.Blocked ||
        (await this.findMatches([locked.link], manager)).length === 0
      ) {
        return null;
      }
      // Raw SQL: a takedown is not an edit, so `updated_at` stays as it is.
      await manager.query(`UPDATE "links" SET "status" = $1 WHERE "id" = $2`, [
        StoredLinkStatus.Blocked,
        locked.link.id,
      ]);
      await this.publisher.audit(locked.link, {
        actor: SYSTEM_ACTOR,
        action: 'link.blocked',
        target: { type: 'link', id: locked.link.id },
        metadata: { reason: 'blocklist' },
      });
      return locked;
    });
    if (blocked === null) {
      return false;
    }
    await this.publisher.invalidate(blocked.link, blocked.hostname);
    return true;
  }
}

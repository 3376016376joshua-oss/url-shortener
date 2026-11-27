import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource, In, IsNull, MoreThan, Not } from 'typeorm';
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
   * many it blocked. Safe to repeat: a blocked link is never visited again.
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
        blocked += (await this.block(link)) ? 1 : 0;
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

  /** A link matches through its own destination or any variant it serves. */
  private async findMatches(batch: ReadonlyArray<Link>): Promise<Link[]> {
    const variants = await this.dataSource.getRepository(LinkVariant).find({
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

  private async block(link: Link): Promise<boolean> {
    const result = await this.dataSource
      .getRepository(Link)
      .update(
        { id: link.id, status: Not(StoredLinkStatus.Blocked) },
        { status: StoredLinkStatus.Blocked },
      );
    if (result.affected !== 1) {
      // Deleted or blocked by someone else since the batch was read.
      return false;
    }
    await this.publisher.publish(link, {
      actor: SYSTEM_ACTOR,
      action: 'link.blocked',
      target: { type: 'link', id: link.id },
      metadata: { reason: 'blocklist' },
    });
    return true;
  }
}

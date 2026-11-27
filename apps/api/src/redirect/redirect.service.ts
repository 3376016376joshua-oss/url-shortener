import { Injectable, Logger } from '@nestjs/common';
import { ClickRecorder } from '../analytics/click-recorder.js';
import {
  isReservedShortCode,
  isWellFormedShortCode,
} from '../common/link/short-code.js';
import { CounterName, Metrics } from '../common/metrics/metrics.js';
import { isDatabaseUnavailable } from '../database/database-unavailable.js';
import type { ClickSource } from '../database/entities/click-event.entity.js';
import {
  DestinationSelector,
  type SelectedDestination,
} from '../experiments/destination-selector.js';
import type { CachedLink } from '../link-cache/cache-entry.js';
import { Clock } from './clock.js';
import { LinkResolver } from './link-resolver.js';
import {
  decideRedirect,
  type GoneReason,
  type RedirectDecision,
} from './redirect-decision.js';

/** One visit to a short link, as the HTTP layer saw it. */
export interface RedirectVisit {
  /** The normalised host, or `null` when the request named none that could be a domain. */
  host: string | null;
  code: string;
  source: ClickSource;
  /** In memory only: handed to A/B assignment and to analytics, never logged. */
  ip: string;
  userAgent: string | null;
  referrer: string | null;
}

export type RedirectResult =
  | { outcome: 'found'; location: string }
  | { outcome: 'not_found' }
  | { outcome: 'gone'; reason: GoneReason };

const NOT_FOUND: RedirectDecision = { outcome: 'not_found' };

/** Decides where a visit to `GET /{code}` goes (PRD section 7). */
@Injectable()
export class RedirectService {
  private readonly logger = new Logger(RedirectService.name);

  constructor(
    private readonly resolver: LinkResolver,
    private readonly selector: DestinationSelector,
    private readonly clicks: ClickRecorder,
    private readonly metrics: Metrics,
    private readonly clock: Clock,
  ) {}

  /** Rejects only when the link cannot be looked up at all, which is a 503. */
  async follow(visit: RedirectVisit): Promise<RedirectResult> {
    const now = this.clock.now();
    const decision = await this.decide(visit, now);
    this.countRedirect(decision.outcome);
    if (decision.outcome !== 'found') {
      return decision;
    }
    const { link } = decision;
    const selected = this.selectDestination(link, visit);
    this.recordClick(link, selected, visit, now);
    return { outcome: 'found', location: selected.destinationUrl };
  }

  private async decide(
    visit: RedirectVisit,
    now: Date,
  ): Promise<RedirectDecision> {
    const { host, code } = visit;
    // A code that could never have been issued needs no lookup.
    if (
      host === null ||
      !isWellFormedShortCode(code) ||
      isReservedShortCode(code)
    ) {
      return NOT_FOUND;
    }
    try {
      return decideRedirect(await this.resolver.resolve(host, code, now), now);
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        this.countRedirect('unavailable');
      }
      throw error;
    }
  }

  /**
   * The selector promises never to throw. The redirect does not depend on
   * that promise: whatever happens, the control is a correct answer.
   */
  private selectDestination(
    link: CachedLink,
    visit: RedirectVisit,
  ): SelectedDestination {
    try {
      return this.selector.select(
        {
          linkId: link.id,
          destinationUrl: link.destinationUrl,
          variants: link.variants,
        },
        { ip: visit.ip, userAgent: visit.userAgent },
      );
    } catch (error) {
      this.logger.error(
        `A/B assignment failed for link ${link.id}; serving the control: ${String(error)}`,
      );
      return { destinationUrl: link.destinationUrl, variantId: null };
    }
  }

  /** Hands the click over without waiting; analytics never fails a redirect. */
  private recordClick(
    link: CachedLink,
    selected: SelectedDestination,
    visit: RedirectVisit,
    clickedAt: Date,
  ): void {
    try {
      this.clicks.record({
        linkId: link.id,
        variantId: selected.variantId,
        source: visit.source,
        clickedAt,
        ip: visit.ip,
        userAgent: visit.userAgent,
        referrer: visit.referrer,
      });
    } catch (error) {
      this.logger.error(
        `Click recording failed for link ${link.id}: ${String(error)}`,
      );
    }
  }

  private countRedirect(
    outcome: RedirectDecision['outcome'] | 'unavailable',
  ): void {
    this.metrics.incrementCounter(CounterName.Redirects, { outcome });
  }
}

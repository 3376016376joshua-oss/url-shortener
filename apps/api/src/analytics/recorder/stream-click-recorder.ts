import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CounterName, Metrics } from '../../common/metrics/metrics.js';
import { DeviceType } from '../../database/entities/click-event.entity.js';
import { REDIS_CLIENT, type RedisClient } from '../../redis/redis-client.js';
import { ClickRecorder, type ClickInput } from '../click-recorder.js';
import { Clock } from '../clock.js';
import {
  CLICK_STREAM_KEY,
  VISITOR_DATA_TTL_SECONDS,
  visitorSketchKey,
} from '../redis-keys.js';
import { toStreamFields, type ReducedClick } from '../reduced-click.js';
import { utcDay } from '../utc-day.js';
import { CountryResolver } from './country-resolver.js';
import { DailySalts } from './daily-salts.js';
import { reduceReferrer } from './referrer.js';
import { reduceUserAgent } from './user-agent.js';
import { hashVisitor } from './visitor-hash.js';

/**
 * The stream never outgrows this: if the consumer falls this far behind, the
 * oldest clicks are discarded rather than letting Redis grow without bound.
 */
const MAX_STREAM_LENGTH = 1_000_000;
/** While clicks are being dropped, say so at most this often. */
const DROP_WARNING_INTERVAL_MS = 60_000;

const STREAM_CAP = {
  TRIM: {
    strategy: 'MAXLEN',
    strategyModifier: '~',
    threshold: MAX_STREAM_LENGTH,
  },
} as const;

/**
 * The real click recorder (PRD section 10). Everything personal is reduced
 * here, in memory, before anything leaves the process: the address becomes a
 * country and a visitor hash, the user agent a device and two family names,
 * the referrer a host. The hash goes into the day's sketch and the reduced
 * event onto the stream, in one round trip.
 */
@Injectable()
export class StreamClickRecorder extends ClickRecorder {
  private readonly logger = new Logger(StreamClickRecorder.name);
  private droppedSinceWarning = 0;
  private lastWarningAt = 0;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly countries: CountryResolver,
    private readonly salts: DailySalts,
    private readonly metrics: Metrics,
    private readonly clock: Clock,
  ) {
    super();
  }

  record(click: ClickInput): void {
    // `publish` is async, so even a synchronous fault becomes a rejection
    // handled here: the redirect that called us can neither wait nor fail.
    this.publish(click).then(
      (result) => this.count(result),
      (error: unknown) => this.drop(error),
    );
  }

  private async publish(click: ClickInput): Promise<'recorded' | 'bot'> {
    const reduced = this.reduce(click);
    const fields = toStreamFields(reduced);
    if (reduced.deviceType === DeviceType.Bot) {
      // Stored for the record, but never counted as a visitor.
      await this.redis.xAdd(CLICK_STREAM_KEY, '*', fields, STREAM_CAP);
      return 'bot';
    }
    const day = utcDay(reduced.clickedAt);
    const salt = await this.salts.forDay(day);
    const sketch = visitorSketchKey(reduced.linkId, day);
    await this.redis
      .multi()
      .pfAdd(sketch, hashVisitor(salt, click.ip, click.userAgent))
      .expire(sketch, VISITOR_DATA_TTL_SECONDS, 'NX')
      .xAdd(CLICK_STREAM_KEY, '*', fields, STREAM_CAP)
      .exec();
    return 'recorded';
  }

  private reduce(click: ClickInput): ReducedClick {
    return {
      eventId: randomUUID(),
      clickedAt: click.clickedAt,
      linkId: click.linkId,
      variantId: click.variantId,
      source: click.source,
      country: this.countries.resolve(click.ip),
      ...reduceUserAgent(click.userAgent),
      referrerHost: reduceReferrer(click.referrer),
    };
  }

  private count(result: 'recorded' | 'bot'): void {
    this.metrics.incrementCounter(CounterName.ClickEvents, { result });
  }

  private drop(error: unknown): void {
    this.metrics.incrementCounter(CounterName.ClickEvents, {
      result: 'dropped',
    });
    this.droppedSinceWarning += 1;
    const now = this.clock.now().getTime();
    if (now - this.lastWarningAt < DROP_WARNING_INTERVAL_MS) {
      return;
    }
    // Only the error's own text: a click's details must never reach a log.
    this.logger.warn(
      `Dropped ${this.droppedSinceWarning} click(s); latest cause: ${String(error)}`,
    );
    this.droppedSinceWarning = 0;
    this.lastWarningAt = now;
  }
}

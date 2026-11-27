import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import type { Request, Response } from 'express';
import { ApiException } from '../errors/api-exception.js';
import { CounterName, Metrics } from '../metrics/metrics.js';
import { clientAddressKey } from './client-address-key.js';
import { matchPolicies } from './policy-matcher.js';
import { presentedCredentialHash } from './presented-credential.js';
import { RateLimitCounter, type WindowCount } from './rate-limit-counter.js';
import {
  RATE_LIMIT_SETTINGS,
  RateLimitPolicy,
  type RateLimitSettings,
} from './rate-limit-policy.js';

const KEY_PREFIX = 'ratelimit';
const MILLISECONDS_PER_SECOND = 1_000;

/**
 * Enforces the rate limits of PRD section 13. It is a global guard, so it
 * runs before any controller's authentication guard and guessing credentials
 * is itself limited.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    @Inject(RATE_LIMIT_SETTINGS) private readonly settings: RateLimitSettings,
    private readonly counter: RateLimitCounter,
    private readonly metrics: Metrics,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const credentialHash = presentedCredentialHash(request);
    const policies = matchPolicies({
      method: request.method,
      path: request.path,
      presentsCredential: credentialHash !== null,
    });
    if (policies.length === 0) {
      return true;
    }

    const subjects = {
      address: clientAddressKey(request.ip),
      credential: credentialHash,
    };
    const counts = await this.countRequest(policies, subjects);
    if (counts !== null) {
      this.enforce(policies, counts, http.getResponse<Response>());
    }
    return true;
  }

  /** Resolves to `null` when the request is let through uncounted. */
  private async countRequest(
    policies: RateLimitPolicy[],
    subjects: { address: string; credential: string | null },
  ): Promise<WindowCount[] | null> {
    const keys = policies.map((policy) => {
      const subject =
        policy === RateLimitPolicy.Credential
          ? subjects.credential
          : subjects.address;
      return `${KEY_PREFIX}:${policy}:${subject}`;
    });
    try {
      return await this.counter.count(
        keys,
        this.settings.windowSeconds * MILLISECONDS_PER_SECOND,
      );
    } catch (error) {
      // Redirects must outlive Redis, so they fail open. The management API
      // fails closed: unlimited credential guessing is worse than an outage.
      if (policies.includes(RateLimitPolicy.Redirect)) {
        this.logger.warn(`Redirect let through unlimited: ${String(error)}`);
        return null;
      }
      this.logger.error(`Rate limiting is unavailable: ${String(error)}`);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.ServiceUnavailable,
        'The service is temporarily unavailable',
      );
    }
  }

  private enforce(
    policies: RateLimitPolicy[],
    counts: WindowCount[],
    response: Response,
  ): void {
    const exceeded = policies
      .map((policy, index) => ({ policy, window: counts[index] }))
      .filter(
        (entry): entry is { policy: RateLimitPolicy; window: WindowCount } =>
          entry.window !== undefined &&
          entry.window.count > this.settings.limits[entry.policy],
      );
    if (exceeded.length === 0) {
      return;
    }

    for (const { policy } of exceeded) {
      this.metrics.incrementCounter(CounterName.RateLimitRejections, {
        policy,
      });
    }
    // Every exceeded policy must have reset before a retry can succeed.
    const resetInMs = Math.max(
      ...exceeded.map(({ window }) => window.resetInMs),
    );
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(resetInMs / MILLISECONDS_PER_SECOND),
    );
    response.setHeader('Retry-After', String(retryAfterSeconds));
    throw new ApiException(
      HttpStatus.TOO_MANY_REQUESTS,
      ErrorCode.RateLimited,
      `Too many requests. Try again in ${retryAfterSeconds} seconds`,
    );
  }
}

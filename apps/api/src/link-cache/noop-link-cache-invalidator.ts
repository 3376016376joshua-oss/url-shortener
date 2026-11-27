import { Injectable } from '@nestjs/common';
import { LinkCacheInvalidator } from './link-cache-invalidator.js';

/** Placeholder until the redirect workstream ships the real cache. */
@Injectable()
export class NoopLinkCacheInvalidator extends LinkCacheInvalidator {
  invalidateLink(): Promise<void> {
    return Promise.resolve();
  }

  invalidateDomain(): Promise<void> {
    return Promise.resolve();
  }
}

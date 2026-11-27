import { Injectable } from '@nestjs/common';
import { LinkCacheInvalidator } from './link-cache-invalidator.js';

/** Placeholder until the read-path workstream ships the real cache. */
@Injectable()
export class NoopLinkCacheInvalidator extends LinkCacheInvalidator {
  invalidate(): Promise<void> {
    return Promise.resolve();
  }
}

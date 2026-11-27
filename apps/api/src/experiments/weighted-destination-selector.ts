import { hkdfSync } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { assignDestination } from './assign-destination.js';
import {
  DestinationSelector,
  type RedirectTarget,
  type SelectedDestination,
  type Visitor,
} from './destination-selector.js';

/**
 * Names this use of `APP_SECRET`, so the assignment key is unrelated to any
 * other key derived from the same secret. Changing it reassigns every visitor
 * of every running test.
 */
const ASSIGNMENT_KEY_PURPOSE = 'experiments/ab-assignment/v1';
const ASSIGNMENT_KEY_BYTES = 32;

/** The assignment key for a secret: the same on every instance and after every restart. */
export function deriveAssignmentKey(appSecret: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      appSecret,
      Buffer.alloc(0),
      ASSIGNMENT_KEY_PURPOSE,
      ASSIGNMENT_KEY_BYTES,
    ),
  );
}

/**
 * Splits a link's traffic between its control and its variants by weight,
 * sticky per visitor without a cookie or any stored state (PRD section 11).
 */
@Injectable()
export class WeightedDestinationSelector extends DestinationSelector {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.key = deriveAssignmentKey(config.get('APP_SECRET', { infer: true }));
  }

  select(target: RedirectTarget, visitor: Visitor): SelectedDestination {
    return assignDestination(this.key, target, visitor);
  }
}

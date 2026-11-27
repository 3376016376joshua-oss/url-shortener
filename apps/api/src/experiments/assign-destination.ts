import { createHmac } from 'node:crypto';
import type {
  RedirectTarget,
  SelectedDestination,
  VariantTarget,
  Visitor,
} from './destination-selector.js';

/** A visitor's hash lands on one of these, spread evenly. */
export const BUCKET_COUNT = 10_000;
const BUCKETS_PER_PERCENT = BUCKET_COUNT / 100;
const MIN_VARIANT_WEIGHT = 1;
/** The control always keeps at least one percent, so it is always there to fall back to. */
const MAX_TOTAL_VARIANT_WEIGHT = 99;
/**
 * Bytes of the digest turned into a number. Six is the most a double holds
 * exactly, and 2^48 is so much larger than the bucket count that the modulo
 * bias is below one in ten billion.
 */
const DIGEST_BYTES_USED = 6;
/** Keeps "ab" + "c" and "a" + "bc" from hashing alike. */
const FIELD_SEPARATOR = '\0';

/** The visitor's place on the 0 to 9,999 range for one link. */
export function computeBucket(
  key: Buffer,
  linkId: string,
  visitor: Visitor,
): number {
  const digest = createHmac('sha256', key)
    .update(
      [linkId, visitor.ip, visitor.userAgent ?? ''].join(FIELD_SEPARATOR),
      'utf8',
    )
    .digest();
  return digest.readUIntBE(0, DIGEST_BYTES_USED) % BUCKET_COUNT;
}

function isServable(variant: unknown): variant is VariantTarget {
  if (typeof variant !== 'object' || variant === null) {
    return false;
  }
  const { id, destinationUrl, weight } = variant as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    id !== '' &&
    typeof destinationUrl === 'string' &&
    destinationUrl !== '' &&
    typeof weight === 'number' &&
    Number.isInteger(weight) &&
    weight >= MIN_VARIANT_WEIGHT &&
    weight <= MAX_TOTAL_VARIANT_WEIGHT
  );
}

/**
 * The variants in the order they are laid on the bucket range, or `null`
 * when the set cannot be trusted: empty, malformed, or weighing past 99.
 *
 * Ids are UUIDv7, so sorting by id is the order of creation, and every
 * instance lays the variants out identically however the list reached it.
 */
function layOutVariants(variants: unknown): VariantTarget[] | null {
  if (!Array.isArray(variants) || variants.length === 0) {
    return null;
  }
  if (!variants.every(isServable)) {
    return null;
  }
  const totalWeight = variants.reduce((sum, { weight }) => sum + weight, 0);
  const distinctIds = new Set(variants.map(({ id }) => id));
  if (
    totalWeight > MAX_TOTAL_VARIANT_WEIGHT ||
    distinctIds.size !== variants.length
  ) {
    return null;
  }
  return variants.toSorted((first, second) =>
    first.id < second.id ? -1 : first.id > second.id ? 1 : 0,
  );
}

/**
 * Chooses the destination that owns the visitor's bucket (PRD section 11).
 * Each variant takes `weight x 100` buckets from the bottom of the range and
 * the control takes whatever is left at the top. Whenever a variant cannot be
 * chosen, for any reason at all, the answer is the control.
 */
export function assignDestination(
  key: Buffer,
  target: RedirectTarget,
  visitor: Visitor,
): SelectedDestination {
  const control = { destinationUrl: target.destinationUrl, variantId: null };
  try {
    const variants = layOutVariants(target.variants);
    if (variants === null) {
      return control;
    }
    const bucket = computeBucket(key, target.linkId, visitor);
    let upperBound = 0;
    for (const variant of variants) {
      upperBound += variant.weight * BUCKETS_PER_PERCENT;
      if (bucket < upperBound) {
        return {
          destinationUrl: variant.destinationUrl,
          variantId: variant.id,
        };
      }
    }
    return control;
  } catch {
    // A redirect must never fail because of an experiment (AB-3). The inputs
    // come from a cache entry, so anything about them may be wrong.
    return control;
  }
}

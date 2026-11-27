import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@url-shortener/contracts';
import {
  ACTIVE_VARIANTS_MAX,
  VARIANT_TOTAL_WEIGHT_MAX,
  type VariantResponse,
} from '@url-shortener/contracts/links';
import { ApiException } from '../common/errors/api-exception.js';
import type { LinkVariant } from '../database/entities/link-variant.entity.js';

export function toVariantResponse(variant: LinkVariant): VariantResponse {
  return {
    id: variant.id,
    name: variant.name,
    destinationUrl: variant.destinationUrl,
    weight: variant.weight,
    archivedAt: variant.archivedAt?.toISOString() ?? null,
    createdAt: variant.createdAt.toISOString(),
  };
}

/** A link runs at most four variants at a time; archived ones do not count. */
export function assertRoomForVariant(
  activeVariants: ReadonlyArray<LinkVariant>,
): void {
  if (activeVariants.length >= ACTIVE_VARIANTS_MAX) {
    throw new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.QuotaExceeded,
      `A link can have at most ${ACTIVE_VARIANTS_MAX} active variants`,
    );
  }
}

/**
 * The control must always keep some traffic, so the weights of the variants
 * that would be active may not sum past the limit.
 */
export function assertWeightsFit(weights: ReadonlyArray<number>): void {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total > VARIANT_TOTAL_WEIGHT_MAX) {
    throw new ApiException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.QuotaExceeded,
      `The weights of a link's active variants can sum to at most ${VARIANT_TOTAL_WEIGHT_MAX}; this would make it ${total}`,
    );
  }
}

/** An archived variant is history: it can be read, not changed or promoted. */
export function assertNotArchived(variant: LinkVariant): void {
  if (variant.archivedAt !== null) {
    throw new ApiException(
      HttpStatus.CONFLICT,
      ErrorCode.Conflict,
      'This variant is archived and can no longer be changed',
    );
  }
}

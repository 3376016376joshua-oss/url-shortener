import {
  DomainStatus,
  type Domain,
} from '../database/entities/domain.entity.js';
import type { DomainCheckResult } from './domain-dns-checker.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** A new claim is re-checked every minute for this long, then hourly. */
export const FAST_RECHECK_WINDOW_MS = HOUR_MS;
export const FAST_RECHECK_INTERVAL_MS = MINUTE_MS;
export const SLOW_RECHECK_INTERVAL_MS = HOUR_MS;
/** A claim that never verified is given up on after this long. */
export const PENDING_GIVE_UP_AFTER_MS = 72 * HOUR_MS;
export const ACTIVE_RECHECK_INTERVAL_MS = 24 * HOUR_MS;
/** Consecutive failed checks after which an active domain stops serving. */
export const MAX_FAILED_ACTIVE_CHECKS = 3;
/** An admin can ask for a check at most this often. */
export const MANUAL_RECHECK_INTERVAL_MS = MINUTE_MS;

type CheckedDomain = Pick<
  Domain,
  'status' | 'failedChecks' | 'verifiedAt' | 'createdAt'
>;

export type VerificationState = Pick<
  Domain,
  'status' | 'failedChecks' | 'verifiedAt'
>;

const before = (now: Date, ms: number): Date => new Date(now.getTime() - ms);

/** Where a checked domain stands after one check, given where it stood. */
export function applyCheck(
  domain: CheckedDomain,
  result: DomainCheckResult,
  now: Date,
): VerificationState {
  const { status, failedChecks, verifiedAt } = domain;
  if (result.ownershipVerified && result.routingVerified) {
    const stillActive = status === DomainStatus.Active;
    return {
      status: DomainStatus.Active,
      failedChecks: 0,
      verifiedAt: stillActive ? verifiedAt : now,
    };
  }
  if (status === DomainStatus.Active) {
    const failed = failedChecks + 1;
    return failed >= MAX_FAILED_ACTIVE_CHECKS
      ? {
          status: DomainStatus.Inactive,
          failedChecks: failed,
          verifiedAt: null,
        }
      : { status, failedChecks: failed, verifiedAt };
  }
  const gaveUp =
    status === DomainStatus.Pending &&
    domain.createdAt <= before(now, PENDING_GIVE_UP_AFTER_MS);
  return {
    status: gaveUp ? DomainStatus.Inactive : status,
    failedChecks,
    verifiedAt: null,
  };
}

/** True when a check an admin asks for now would come too soon. */
export function wasCheckedRecently(
  domain: Pick<Domain, 'lastCheckedAt'>,
  now: Date,
): boolean {
  return (
    domain.lastCheckedAt !== null &&
    domain.lastCheckedAt > before(now, MANUAL_RECHECK_INTERVAL_MS)
  );
}

/** The instants that decide which domains the scheduled sweep must check. */
export interface DueCutoffs {
  /** Claims created after this are still in their fast re-check window. */
  fastWindowStart: Date;
  /** A claim in the fast window is due when last checked at or before this. */
  fastCheckedBefore: Date;
  /** An older pending claim is due when last checked at or before this. */
  slowCheckedBefore: Date;
  /** An active domain is due when last checked at or before this. */
  activeCheckedBefore: Date;
}

export function dueCutoffs(now: Date): DueCutoffs {
  return {
    fastWindowStart: before(now, FAST_RECHECK_WINDOW_MS),
    fastCheckedBefore: before(now, FAST_RECHECK_INTERVAL_MS),
    slowCheckedBefore: before(now, SLOW_RECHECK_INTERVAL_MS),
    activeCheckedBefore: before(now, ACTIVE_RECHECK_INTERVAL_MS),
  };
}

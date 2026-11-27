import { describe, expect, it } from 'vitest';
import { DomainStatus } from '../database/entities/domain.entity.js';
import {
  applyCheck,
  dueCutoffs,
  wasCheckedRecently,
} from './verification-policy.js';

const NOW = new Date('2026-11-27T12:00:00.000Z');
const HOUR_MS = 3_600_000;
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

const PASSED = { ownershipVerified: true, routingVerified: true };
const FAILURES = [
  ['only the TXT record', { ownershipVerified: true, routingVerified: false }],
  ['only the CNAME', { ownershipVerified: false, routingVerified: true }],
  ['neither record', { ownershipVerified: false, routingVerified: false }],
] as const;

const pending = (createdAt = ago(HOUR_MS)) => ({
  status: DomainStatus.Pending,
  failedChecks: 0,
  verifiedAt: null,
  createdAt,
});
const active = (failedChecks = 0) => ({
  status: DomainStatus.Active,
  failedChecks,
  verifiedAt: ago(48 * HOUR_MS),
  createdAt: ago(72 * HOUR_MS),
});
const inactive = () => ({
  status: DomainStatus.Inactive,
  failedChecks: 3,
  verifiedAt: null,
  createdAt: ago(200 * HOUR_MS),
});

describe('applyCheck', () => {
  it('activates a pending domain when both checks pass', () => {
    expect(applyCheck(pending(), PASSED, NOW)).toEqual({
      status: DomainStatus.Active,
      failedChecks: 0,
      verifiedAt: NOW,
    });
  });

  it.each(FAILURES)('keeps a domain pending with %s', (_name, result) => {
    expect(applyCheck(pending(), result, NOW)).toEqual({
      status: DomainStatus.Pending,
      failedChecks: 0,
      verifiedAt: null,
    });
  });

  it('gives up on a claim that has not verified within 72 hours', () => {
    const justUnder = pending(ago(72 * HOUR_MS - 1));
    const atLimit = pending(ago(72 * HOUR_MS));

    expect(applyCheck(justUnder, FAILURES[2][1], NOW).status).toBe(
      DomainStatus.Pending,
    );
    expect(applyCheck(atLimit, FAILURES[2][1], NOW).status).toBe(
      DomainStatus.Inactive,
    );
  });

  it('still activates a claim older than 72 hours whose check passes', () => {
    const old = pending(ago(100 * HOUR_MS));

    expect(applyCheck(old, PASSED, NOW).status).toBe(DomainStatus.Active);
  });

  it('keeps the verification time of a domain that stays active', () => {
    const domain = active(2);

    expect(applyCheck(domain, PASSED, NOW)).toEqual({
      status: DomainStatus.Active,
      failedChecks: 0,
      verifiedAt: domain.verifiedAt,
    });
  });

  it.each(FAILURES)(
    'counts a failed check of an active domain with %s',
    (_name, result) => {
      const domain = active(0);

      expect(applyCheck(domain, result, NOW)).toEqual({
        status: DomainStatus.Active,
        failedChecks: 1,
        verifiedAt: domain.verifiedAt,
      });
    },
  );

  it('deactivates an active domain on its third consecutive failure', () => {
    expect(applyCheck(active(1), FAILURES[2][1], NOW).status).toBe(
      DomainStatus.Active,
    );
    expect(applyCheck(active(2), FAILURES[2][1], NOW)).toEqual({
      status: DomainStatus.Inactive,
      failedChecks: 3,
      verifiedAt: null,
    });
  });

  it('reactivates an inactive domain when both checks pass', () => {
    expect(applyCheck(inactive(), PASSED, NOW)).toEqual({
      status: DomainStatus.Active,
      failedChecks: 0,
      verifiedAt: NOW,
    });
  });

  it('leaves an inactive domain inactive when a check fails', () => {
    expect(applyCheck(inactive(), FAILURES[0][1], NOW).status).toBe(
      DomainStatus.Inactive,
    );
  });
});

describe('wasCheckedRecently', () => {
  it('is false for a domain that was never checked', () => {
    expect(wasCheckedRecently({ lastCheckedAt: null }, NOW)).toBe(false);
  });

  it('is true within a minute of the last check, and false from then on', () => {
    expect(wasCheckedRecently({ lastCheckedAt: ago(59_999) }, NOW)).toBe(true);
    expect(wasCheckedRecently({ lastCheckedAt: ago(60_000) }, NOW)).toBe(false);
  });
});

describe('dueCutoffs', () => {
  it('places each cutoff its interval before now', () => {
    expect(dueCutoffs(NOW)).toEqual({
      fastWindowStart: ago(HOUR_MS),
      fastCheckedBefore: ago(60_000),
      slowCheckedBefore: ago(HOUR_MS),
      activeCheckedBefore: ago(24 * HOUR_MS),
    });
  });
});

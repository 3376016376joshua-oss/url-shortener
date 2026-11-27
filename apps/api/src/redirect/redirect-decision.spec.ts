import { describe, expect, it } from 'vitest';
import type { CachedDomain, CachedLink } from '../link-cache/cache-entry.js';
import { decideRedirect } from './redirect-decision.js';

const NOW = new Date('2026-11-27T08:00:00.000Z');
const DOMAIN: CachedDomain = { id: 'domain-1', status: 'ACTIVE' };
const LINK: CachedLink = {
  id: 'link-1',
  domainId: DOMAIN.id,
  destinationUrl: 'https://example.com/landing',
  status: 'ACTIVE',
  expiresAt: null,
  variants: [],
};

describe('decideRedirect', () => {
  it('redirects an active link on an active domain', () => {
    expect(decideRedirect({ domain: DOMAIN, link: LINK }, NOW)).toEqual({
      outcome: 'found',
      link: LINK,
    });
  });

  it('redirects until the instant of expiry, and not at it', () => {
    const expiring = (ms: number): CachedLink => ({
      ...LINK,
      expiresAt: new Date(NOW.getTime() + ms),
    });

    expect(
      decideRedirect({ domain: DOMAIN, link: expiring(1) }, NOW).outcome,
    ).toBe('found');
    expect(decideRedirect({ domain: DOMAIN, link: expiring(0) }, NOW)).toEqual({
      outcome: 'gone',
      reason: 'expired',
    });
  });

  it.each(['DISABLED', 'BLOCKED'] as const)(
    'reports a %s link as disabled, even one that has also expired',
    (status) => {
      const link = { ...LINK, status, expiresAt: new Date(0) };

      expect(decideRedirect({ domain: DOMAIN, link }, NOW)).toEqual({
        outcome: 'gone',
        reason: 'disabled',
      });
    },
  );

  it('does not find a code that does not exist on the domain', () => {
    expect(decideRedirect({ domain: DOMAIN, link: null }, NOW)).toEqual({
      outcome: 'not_found',
    });
  });

  it('does not find anything on a host no domain serves', () => {
    expect(decideRedirect({ domain: null, link: null }, NOW)).toEqual({
      outcome: 'not_found',
    });
  });

  it.each(['PENDING', 'INACTIVE', 'BLOCKED'] as const)(
    'does not find a link on a %s domain, whatever the state of the link',
    (status) => {
      const domain = { ...DOMAIN, status };
      const disabled = { ...LINK, status: 'DISABLED' as const };

      expect(decideRedirect({ domain, link: LINK }, NOW).outcome).toBe(
        'not_found',
      );
      expect(decideRedirect({ domain, link: disabled }, NOW).outcome).toBe(
        'not_found',
      );
    },
  );
});

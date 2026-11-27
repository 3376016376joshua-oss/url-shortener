import { describe, expect, it } from 'vitest';
import { LinkState, StoredLinkStatus, resolveLinkState } from './link-state.js';

const NOW = new Date('2026-11-27T12:00:00.000Z');
const PAST = new Date('2026-11-27T11:59:59.999Z');
const FUTURE = new Date('2026-11-27T12:00:00.001Z');

describe('resolveLinkState', () => {
  it('is active when the link is enabled and never expires', () => {
    const link = { status: StoredLinkStatus.Active, expiresAt: null };

    expect(resolveLinkState(link, NOW)).toBe(LinkState.Active);
  });

  it('is active while the expiry is still in the future', () => {
    const link = { status: StoredLinkStatus.Active, expiresAt: FUTURE };

    expect(resolveLinkState(link, NOW)).toBe(LinkState.Active);
  });

  it('is expired once the expiry has passed', () => {
    const link = { status: StoredLinkStatus.Active, expiresAt: PAST };

    expect(resolveLinkState(link, NOW)).toBe(LinkState.Expired);
  });

  it('is expired at the exact instant of expiry', () => {
    const link = { status: StoredLinkStatus.Active, expiresAt: NOW };

    expect(resolveLinkState(link, NOW)).toBe(LinkState.Expired);
  });

  it('is disabled when the owner disabled it', () => {
    const link = { status: StoredLinkStatus.Disabled, expiresAt: null };

    expect(resolveLinkState(link, NOW)).toBe(LinkState.Disabled);
  });

  it('is blocked when a platform admin took it down', () => {
    const link = { status: StoredLinkStatus.Blocked, expiresAt: null };

    expect(resolveLinkState(link, NOW)).toBe(LinkState.Blocked);
  });

  it('reports blocked rather than expired when both apply', () => {
    const link = { status: StoredLinkStatus.Blocked, expiresAt: PAST };

    expect(resolveLinkState(link, NOW)).toBe(LinkState.Blocked);
  });

  it('reports disabled rather than expired when both apply', () => {
    const link = { status: StoredLinkStatus.Disabled, expiresAt: PAST };

    expect(resolveLinkState(link, NOW)).toBe(LinkState.Disabled);
  });
});

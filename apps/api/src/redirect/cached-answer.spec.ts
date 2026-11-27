import { describe, expect, it } from 'vitest';
import type {
  CacheRead,
  CachedDomain,
  CachedLink,
} from '../link-cache/cache-entry.js';
import { answerFromCache } from './cached-answer.js';

const DOMAIN: CachedDomain = { id: 'domain-1', status: 'ACTIVE' };
const LINK: CachedLink = {
  id: 'link-1',
  domainId: DOMAIN.id,
  destinationUrl: 'https://example.com/landing',
  status: 'ACTIVE',
  expiresAt: null,
  variants: [],
};

const hit = <T>(value: T): CacheRead<T> => ({ kind: 'hit', value });
const NOT_FOUND = { kind: 'not_found' } as const;
const UNUSABLE = { kind: 'unusable' } as const;
const MISS = { kind: 'miss' } as const;

describe('answerFromCache', () => {
  it('answers with the link when both keys hit', () => {
    expect(answerFromCache({ domain: hit(DOMAIN), link: hit(LINK) })).toEqual({
      resolved: { domain: DOMAIN, link: LINK },
      result: 'hit',
    });
  });

  it('answers a link that is cached in any state, leaving the state to the caller', () => {
    const disabled = { ...LINK, status: 'DISABLED' as const };

    expect(
      answerFromCache({ domain: hit(DOMAIN), link: hit(disabled) })?.resolved
        .link,
    ).toEqual(disabled);
  });

  it('answers "no such code" from a negative link entry', () => {
    expect(answerFromCache({ domain: hit(DOMAIN), link: NOT_FOUND })).toEqual({
      resolved: { domain: DOMAIN, link: null },
      result: 'negative_hit',
    });
  });

  it.each([hit(LINK), NOT_FOUND, UNUSABLE, MISS])(
    'answers "no such host" from a negative domain entry, whatever the link key holds',
    (link) => {
      expect(answerFromCache({ domain: NOT_FOUND, link })).toEqual({
        resolved: { domain: null, link: null },
        result: 'negative_hit',
      });
    },
  );

  it.each([hit(LINK), MISS])(
    'answers without the link when the cached domain is not active',
    (link) => {
      const blocked = { ...DOMAIN, status: 'BLOCKED' as const };

      expect(answerFromCache({ domain: hit(blocked), link })).toEqual({
        resolved: { domain: blocked, link: null },
        result: 'hit',
      });
    },
  );

  it.each([
    ['the domain is not cached', { domain: MISS, link: hit(LINK) }],
    ['the domain was just invalidated', { domain: UNUSABLE, link: hit(LINK) }],
    ['the link is not cached', { domain: hit(DOMAIN), link: MISS }],
    ['the link was just invalidated', { domain: hit(DOMAIN), link: UNUSABLE }],
    [
      'the link belongs to a previous owner of the host',
      { domain: hit(DOMAIN), link: hit({ ...LINK, domainId: 'domain-0' }) },
    ],
  ])('leaves the answer to Postgres when %s', (_reason, snapshot) => {
    expect(answerFromCache(snapshot)).toBeNull();
  });
});

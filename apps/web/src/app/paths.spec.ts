import { describe, expect, it } from 'vitest';
import { paths, resolveNextPath, signInPath } from './paths.js';

describe('paths', () => {
  it('builds the addresses of a workspace and of a link in it', () => {
    expect(paths.workspace('ws-1')).toBe('/w/ws-1');
    expect(paths.links('ws-1')).toBe('/w/ws-1/links');
    expect(paths.link('ws-1', 'link-9')).toBe('/w/ws-1/links/link-9');
  });
});

describe('signInPath', () => {
  it('carries the address to return to', () => {
    expect(signInPath('/w/ws-1/links?status=ACTIVE')).toBe(
      '/sign-in?next=%2Fw%2Fws-1%2Flinks%3Fstatus%3DACTIVE',
    );
  });

  it('carries nothing when the address is the home page anyway', () => {
    expect(signInPath('/')).toBe('/sign-in');
  });
});

describe('resolveNextPath', () => {
  it('returns the path the sign-in address carries', () => {
    const search = new URL(
      signInPath('/w/ws-1/links?status=ACTIVE'),
      'http://x',
    ).search;

    expect(resolveNextPath(search)).toBe('/w/ws-1/links?status=ACTIVE');
  });

  it('falls back to the home page when there is none', () => {
    expect(resolveNextPath('')).toBe('/');
  });

  it.each([
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example/',
    'javascript:alert(1)',
    'w/ws-1',
    '/\n/evil.example',
  ])('ignores %j, which could leave this site', (next) => {
    const search = `?${new URLSearchParams({ next }).toString()}`;

    expect(resolveNextPath(search)).toBe('/');
  });
});

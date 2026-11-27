import { describe, expect, it } from 'vitest';
import { reduceReferrer } from './referrer.js';

describe('reduceReferrer', () => {
  it('keeps only the host of a referrer', () => {
    expect(
      reduceReferrer('https://news.example.com/story/42?token=secret#top'),
    ).toBe('news.example.com');
  });

  it('lowercases the host and drops the port and credentials', () => {
    expect(reduceReferrer('http://user:pass@News.Example.COM:8443/')).toBe(
      'news.example.com',
    );
  });

  it.each([
    ['no header', null],
    ['an empty header', ''],
    ['something that is not a URL', 'not a url'],
    ['a non-web scheme', 'android-app://com.example.app'],
    ['a URL without a host', 'file:///etc/hosts'],
  ])('treats %s as a direct visit', (_reason, referrer) => {
    expect(reduceReferrer(referrer)).toBeNull();
  });
});

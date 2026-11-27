import { describe, expect, it } from 'vitest';
import { reduceUserAgent } from './user-agent.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAC_FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const SMART_TV =
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36';

describe('reduceUserAgent', () => {
  it.each([
    [IPHONE, { deviceType: 'mobile', os: 'iOS', browser: 'Safari' }],
    [IPAD, { deviceType: 'tablet', os: 'iOS', browser: 'Safari' }],
    [
      WINDOWS_CHROME,
      { deviceType: 'desktop', os: 'Windows', browser: 'Chrome' },
    ],
    [MAC_FIREFOX, { deviceType: 'desktop', os: 'macOS', browser: 'Firefox' }],
    [
      ANDROID_CHROME,
      { deviceType: 'mobile', os: 'Android', browser: 'Chrome' },
    ],
  ])('reduces %s', (userAgent, expected) => {
    expect(reduceUserAgent(userAgent)).toEqual(expected);
  });

  it('keeps no version number', () => {
    const reduced = reduceUserAgent(WINDOWS_CHROME);

    expect(`${reduced.os} ${reduced.browser}`).not.toMatch(/\d/);
  });

  it('files a device that is not a desktop, phone, or tablet under other', () => {
    expect(reduceUserAgent(SMART_TV).deviceType).toBe('other');
  });

  it.each([
    [
      'a search crawler',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ],
    [
      'a link-preview fetcher',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    ],
    [
      'a chat unfurler',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    ],
    ['an uptime monitor', 'UptimeRobot/2.0'],
    ['a command-line client', 'curl/8.1.0'],
  ])('recognises %s as a bot', (_kind, userAgent) => {
    expect(reduceUserAgent(userAgent).deviceType).toBe('bot');
  });

  it.each([[null], [''], ['   ']])(
    'reports a missing user agent (%j) as unknown, not as a bot',
    (userAgent) => {
      expect(reduceUserAgent(userAgent)).toEqual({
        deviceType: 'other',
        os: 'Unknown',
        browser: 'Unknown',
      });
    },
  );

  it('never returns a family name longer than the column', () => {
    const reduced = reduceUserAgent(`Mozilla/5.0 ${'x'.repeat(5_000)}`);

    expect(reduced.os.length).toBeLessThanOrEqual(32);
    expect(reduced.browser.length).toBeLessThanOrEqual(32);
  });
});

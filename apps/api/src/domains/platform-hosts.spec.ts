import { describe, expect, it } from 'vitest';
import { PlatformHosts } from './platform-hosts.js';

const hosts = PlatformHosts.fromEnv({
  APP_URL: 'https://App.Shortener.example:8443',
  DEFAULT_SHORT_DOMAIN: 'sho.rt',
  CNAME_TARGET: 'cname.sho.rt',
});

describe('PlatformHosts', () => {
  it.each(['app.shortener.example', 'sho.rt', 'cname.sho.rt'])(
    'includes %s',
    (hostname) => {
      expect(hosts.includes(hostname)).toBe(true);
      expect(hosts.covers(hostname)).toBe(true);
    },
  );

  it.each(['links.sho.rt', 'a.b.app.shortener.example'])(
    'covers the subdomain %s without including it',
    (hostname) => {
      expect(hosts.covers(hostname)).toBe(true);
      expect(hosts.includes(hostname)).toBe(false);
    },
  );

  it.each(['go.brand.com', 'notsho.rt', 'shortener.example', 'rt'])(
    'leaves %s to its owner',
    (hostname) => {
      expect(hosts.covers(hostname)).toBe(false);
      expect(hosts.includes(hostname)).toBe(false);
    },
  );
});

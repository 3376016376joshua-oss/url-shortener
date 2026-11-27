import { describe, expect, it } from 'vitest';
import {
  DestinationRisk,
  assessDestination,
  destinationHost,
  isLocalAddress,
} from './destination-policy.js';

const policy = {
  blockedHosts: ['evil.test', 'bad.example'],
  platformHosts: ['app.shortener.test', 'sho.test'],
};

/** Destinations are stored normalised, so the tests normalise theirs too. */
const assess = (url: string) => assessDestination(new URL(url).href, policy);

describe('destinationHost', () => {
  it.each([
    ['https://Example.com:8443/path', 'example.com'],
    ['https://example.com./', 'example.com'],
    ['http://[::1]:3000/', '::1'],
    ['http://user:secret@example.com/', 'example.com'],
  ])('reads the host of %s', (url, host) => {
    expect(destinationHost(new URL(url).href)).toBe(host);
  });
});

describe('isLocalAddress', () => {
  it.each([
    'localhost',
    'api.localhost',
    '127.0.0.1',
    '127.255.255.254',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fe80::1',
    'fd12:3456:789a::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
  ])('refuses %s', (host) => {
    expect(isLocalAddress(host)).toBe(true);
  });

  it.each([
    'example.com',
    'localhost.example.com',
    'notlocalhost',
    '8.8.8.8',
    '172.32.0.1',
    '192.169.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('allows %s', (host) => {
    expect(isLocalAddress(host)).toBe(false);
  });
});

describe('assessDestination', () => {
  it.each([
    'https://evil.test/',
    'https://login.evil.test/phish',
    'https://EVIL.test./',
    'http://a.b.bad.example:8080/',
  ])('refuses the blocklisted destination %s', (url) => {
    expect(assess(url)).toBe(DestinationRisk.BlockedHost);
  });

  it.each(['http://app.shortener.test/links', 'https://sho.test/abc1234'])(
    'refuses %s, which would loop back to the platform',
    (url) => {
      expect(assess(url)).toBe(DestinationRisk.PlatformHost);
    },
  );

  it.each([
    'http://127.0.0.1/',
    'http://localhost:3000/',
    'http://[::1]/',
    'http://192.168.0.10/admin',
    // Other spellings of 127.0.0.1 that URL parsing normalises.
    'http://2130706433/',
    'http://0x7f.1/',
    'http://[::ffff:7f00:1]/',
  ])('refuses the local destination %s', (url) => {
    expect(assess(url)).toBe(DestinationRisk.LocalAddress);
  });

  it.each([
    'https://example.com/landing',
    'https://notevil.test/',
    'https://evil.test.example.org/',
    'https://other.sho.test.example/',
    'http://8.8.8.8/',
  ])('allows %s', (url) => {
    expect(assess(url)).toBeNull();
  });
});

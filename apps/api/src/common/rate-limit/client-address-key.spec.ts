import { describe, expect, it } from 'vitest';
import { clientAddressKey } from './client-address-key.js';

describe('clientAddressKey', () => {
  it('keys an IPv4 client by its address', () => {
    expect(clientAddressKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('keys an IPv4-mapped IPv6 address as the IPv4 address it is', () => {
    expect(clientAddressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('keys an IPv6 client by its /64 prefix', () => {
    expect(clientAddressKey('2001:db8:aa:bb:1:2:3:4')).toBe(
      '2001:db8:aa:bb::/64',
    );
  });

  it('gives every address in one /64 the same key', () => {
    expect(clientAddressKey('2001:db8:aa:bb::1')).toBe(
      clientAddressKey('2001:0DB8:00aa:00bb:ffff:ffff:ffff:ffff'),
    );
  });

  it('tells neighbouring /64 networks apart', () => {
    expect(clientAddressKey('2001:db8:aa:bb::1')).not.toBe(
      clientAddressKey('2001:db8:aa:bc::1'),
    );
  });

  it.each([
    ['the loopback address', '::1', '0:0:0:0::/64'],
    ['a prefix shortened by "::"', '2001:db8::1', '2001:db8:0:0::/64'],
    ['a link-local address with a zone', 'fe80::1%eth0', 'fe80:0:0:0::/64'],
  ])('expands %s', (_what, address, key) => {
    expect(clientAddressKey(address)).toBe(key);
  });

  it.each([undefined, '', 'not-an-address'])(
    'puts an unreadable address (%s) in one shared bucket',
    (address) => {
      expect(clientAddressKey(address)).toBe('unknown');
    },
  );
});

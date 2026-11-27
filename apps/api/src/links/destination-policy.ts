import { BlockList, isIP } from 'node:net';

/** Why a destination is refused. */
export const DestinationRisk = {
  BlockedHost: 'blocked_host',
  PlatformHost: 'platform_host',
  LocalAddress: 'local_address',
} as const;
export type DestinationRisk =
  (typeof DestinationRisk)[keyof typeof DestinationRisk];

export interface DestinationPolicy {
  /** The operator's blocklist; each entry also covers its subdomains. */
  blockedHosts: ReadonlyArray<string>;
  /** The app host and the platform's short domain: linking there would loop. */
  platformHosts: ReadonlyArray<string>;
}

const LOCALHOST = 'localhost';
const IPV4 = 4;

/** Loopback, private, link-local, and unspecified ranges, by address family. */
const LOCAL_SUBNETS: ReadonlyArray<[string, number, 'ipv4' | 'ipv6']> = [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  // Unspecified, loopback, and the IPv4-compatible form of every IPv4 address.
  ['::', 96, 'ipv6'],
  // NAT64 and 6to4 embed an IPv4 address, which may be a local one.
  ['64:ff9b::', 96, 'ipv6'],
  ['2002::', 16, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['fec0::', 10, 'ipv6'],
];

const localAddresses = new BlockList();
for (const [network, prefix, family] of LOCAL_SUBNETS) {
  localAddresses.addSubnet(network, prefix, family);
}

/**
 * The host of a stored destination, comparable with configured host names:
 * without the brackets of an IPv6 literal and without trailing dots.
 */
export function destinationHost(destinationUrl: string): string {
  return new URL(destinationUrl).hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
}

/** True when the host is one of `hosts` or a subdomain of one. */
export function isHostOrSubdomainOf(
  host: string,
  hosts: ReadonlyArray<string>,
): boolean {
  return hosts.some(
    (candidate) => host === candidate || host.endsWith(`.${candidate}`),
  );
}

/** `localhost`, or a loopback, private, or link-local IP literal. */
export function isLocalAddress(host: string): boolean {
  if (isHostOrSubdomainOf(host, [LOCALHOST])) {
    return true;
  }
  const family = isIP(host);
  if (family === 0) {
    return false;
  }
  // An IPv4-mapped IPv6 literal is checked against the IPv4 ranges too.
  return localAddresses.check(host, family === IPV4 ? 'ipv4' : 'ipv6');
}

/**
 * The part of the risk check that needs no lookup. Customer short domains
 * are checked separately, because they live in the database.
 */
export function assessDestination(
  destinationUrl: string,
  policy: DestinationPolicy,
): DestinationRisk | null {
  const host = destinationHost(destinationUrl);
  if (isHostOrSubdomainOf(host, policy.blockedHosts)) {
    return DestinationRisk.BlockedHost;
  }
  if (policy.platformHosts.includes(host)) {
    return DestinationRisk.PlatformHost;
  }
  if (isLocalAddress(host)) {
    return DestinationRisk.LocalAddress;
  }
  return null;
}

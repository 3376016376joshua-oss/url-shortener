import { isIPv4, isIPv6 } from 'node:net';

const IPV4_MAPPED_PREFIX = /^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i;
const IPV6_GROUPS = 8;
/** The first four groups of an IPv6 address are its /64 network prefix. */
const PREFIX_GROUPS = 4;

/** Used when the address is missing or unreadable: one shared, limited bucket. */
const UNKNOWN_ADDRESS_KEY = 'unknown';

/** Writes out the groups that `::` abbreviates. Expects a valid address. */
function expandIpv6Groups(address: string): string[] {
  const [head = '', tail] = address.split('::');
  const leading = head === '' ? [] : head.split(':');
  if (tail === undefined) {
    return leading;
  }
  const trailing = tail === '' ? [] : tail.split(':');
  const omitted = IPV6_GROUPS - leading.length - trailing.length;
  return [...leading, ...new Array<string>(omitted).fill('0'), ...trailing];
}

/**
 * The rate-limit key for a client address. An IPv4 address is its own key.
 * An IPv6 client is keyed by its /64 prefix, because one subscriber controls
 * a whole /64 and could otherwise use a fresh address for every request.
 */
export function clientAddressKey(address: string | undefined): string {
  if (address === undefined) {
    return UNKNOWN_ADDRESS_KEY;
  }
  // "%eth0" names an interface for a link-local address; it is not the address.
  const bare = (address.split('%')[0] ?? '').replace(IPV4_MAPPED_PREFIX, '');
  if (isIPv4(bare)) {
    return bare;
  }
  if (!isIPv6(bare)) {
    return UNKNOWN_ADDRESS_KEY;
  }
  const prefix = expandIpv6Groups(bare)
    .slice(0, PREFIX_GROUPS)
    .map((group) => Number.parseInt(group, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}

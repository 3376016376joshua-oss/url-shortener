import type { Env } from '../config/env.schema.js';

type PlatformHostsEnv = Pick<
  Env,
  'APP_URL' | 'DEFAULT_SHORT_DOMAIN' | 'CNAME_TARGET'
>;

/**
 * The hosts the platform itself answers on: the app host, its own short
 * domain, and the host custom domains point at. No workspace may claim one.
 */
export class PlatformHosts {
  private readonly hosts: ReadonlySet<string>;

  constructor(hosts: Iterable<string>) {
    this.hosts = new Set([...hosts].map((host) => host.toLowerCase()));
  }

  static fromEnv(env: PlatformHostsEnv): PlatformHosts {
    return new PlatformHosts([
      new URL(env.APP_URL).hostname,
      env.DEFAULT_SHORT_DOMAIN,
      env.CNAME_TARGET,
    ]);
  }

  /** True for a platform host itself. */
  includes(hostname: string): boolean {
    return this.hosts.has(hostname);
  }

  /** True for a platform host or any subdomain of one. */
  covers(hostname: string): boolean {
    return [...this.hosts].some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  }
}

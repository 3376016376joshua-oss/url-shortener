import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import type { DestinationPolicy } from './destination-policy.js';

/** Injection token for the configured `DestinationPolicy`. */
export const DESTINATION_POLICY = Symbol('DESTINATION_POLICY');

export function buildDestinationPolicy(
  config: ConfigService<Env, true>,
): DestinationPolicy {
  return {
    blockedHosts: config.get('BLOCKED_HOSTS', { infer: true }),
    platformHosts: [
      new URL(config.get('APP_URL', { infer: true })).hostname,
      config.get('DEFAULT_SHORT_DOMAIN', { infer: true }),
    ],
  };
}

export const destinationPolicyProvider: FactoryProvider<DestinationPolicy> = {
  provide: DESTINATION_POLICY,
  inject: [ConfigService],
  useFactory: buildDestinationPolicy,
};

import { Logger } from '@nestjs/common';
import { createClient } from 'redis';

/** Injection token for the shared Redis client. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Bounds every Redis command, so a slow Redis degrades instead of stalling. */
const COMMAND_TIMEOUT_MS = 100;
const CONNECT_TIMEOUT_MS = 1_000;

const logger = new Logger('Redis');

/**
 * A refused connection to a host with several addresses surfaces as an
 * AggregateError whose own message is empty; the causes are in `errors`.
 */
function describeConnectionError(error: Error): string {
  const causes = error instanceof AggregateError ? error.errors : [error];
  return causes.map(String).join('; ');
}

/**
 * Builds the shared client. It is tuned to fail fast: while Redis is
 * unreachable, commands reject immediately instead of queueing, which is what
 * lets callers fall back to Postgres or drop the work.
 */
export function createRedisClient(url: string) {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: CONNECT_TIMEOUT_MS },
    commandOptions: { timeout: COMMAND_TIMEOUT_MS, rejectInFlight: true },
  });

  // Without a listener, node-redis rethrows connection errors and kills the
  // process. Reconnection itself is handled by the client.
  client.on('error', (error: Error) => {
    logger.error(`Redis connection error: ${describeConnectionError(error)}`);
  });

  return client;
}

export type RedisClient = ReturnType<typeof createRedisClient>;

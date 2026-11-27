import { setTimeout as sleep } from 'node:timers/promises';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from './redis-client.js';

/** How long start-up waits for Redis before carrying on without it. */
const INITIAL_CONNECT_WAIT_MS = 1_000;

@Injectable()
export class RedisLifecycleService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisLifecycleService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  /**
   * Redis is a cache, not a dependency the application needs in order to
   * serve: start-up gives it a moment to connect, then continues either way
   * and leaves the client reconnecting in the background.
   */
  async onModuleInit(): Promise<void> {
    const connecting = this.client.connect().then(
      () => true,
      (error: unknown) => {
        this.logger.error(`Redis connection failed: ${String(error)}`);
        return false;
      },
    );
    const connected = await Promise.race([
      connecting,
      sleep(INITIAL_CONNECT_WAIT_MS, false, { ref: false }),
    ]);
    if (!connected) {
      this.logger.warn('Starting without Redis; it will be retried');
    }
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}

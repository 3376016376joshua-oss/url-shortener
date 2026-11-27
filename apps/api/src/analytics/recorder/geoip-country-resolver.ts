import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { open, type CountryResponse, type Reader } from 'maxmind';
import type { Env } from '../../config/env.schema.js';
import { UNKNOWN_COUNTRY } from '../../database/entities/click-event.entity.js';
import { CountryResolver } from './country-resolver.js';

const ISO_COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * Country lookup in a local MaxMind-format database (PRD decision 2): no
 * network call on the click path, and no IP address leaves the platform.
 * Without a database every click is recorded with the unknown country.
 */
@Injectable()
export class GeoIpCountryResolver
  extends CountryResolver
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(GeoIpCountryResolver.name);
  private readonly databasePath: string | undefined;
  private readonly watcher = new AbortController();
  private reader: Reader<CountryResponse> | null = null;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.databasePath = config.get('GEOIP_DB_PATH', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    if (this.databasePath === undefined) {
      this.logger.warn(
        `GEOIP_DB_PATH is not set; clicks are recorded with country ${UNKNOWN_COUNTRY}`,
      );
      return;
    }
    try {
      this.reader = await open<CountryResponse>(this.databasePath, {
        // The database is refreshed monthly; pick the new file up in place.
        watchForUpdates: true,
        watchForUpdatesNonPersistent: true,
        signal: this.watcher.signal,
      });
    } catch (error) {
      this.logger.warn(
        `GeoIP database ${this.databasePath} could not be read; clicks are recorded with country ${UNKNOWN_COUNTRY}: ${String(error)}`,
      );
    }
  }

  resolve(ip: string): string {
    if (this.reader === null) {
      return UNKNOWN_COUNTRY;
    }
    try {
      const code = this.reader.get(ip)?.country?.iso_code ?? '';
      return ISO_COUNTRY_CODE.test(code) ? code : UNKNOWN_COUNTRY;
    } catch {
      // Not an address the database can look up. Deliberately not logged:
      // the message would carry the address.
      return UNKNOWN_COUNTRY;
    }
  }

  onApplicationShutdown(): void {
    this.watcher.abort();
  }
}

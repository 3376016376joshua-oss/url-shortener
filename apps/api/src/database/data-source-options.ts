import type { DataSourceOptions } from 'typeorm';
import { entities } from './entities/index.js';
import { migrations } from './migrations/index.js';

const CONNECT_TIMEOUT_MS = 2_000;

/** Bounds every query the application runs, so a slow database fails fast. */
export const STATEMENT_TIMEOUT_MS = 2_000;

/** Connection settings shared by the application and the migration runner. */
export function buildDataSourceOptions(
  databaseUrl: string,
  statementTimeoutMs?: number,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities,
    migrations,
    // The schema only ever changes through migrations, run as their own step.
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    extra:
      statementTimeoutMs === undefined
        ? {}
        : { statement_timeout: statementTimeoutMs },
  };
}

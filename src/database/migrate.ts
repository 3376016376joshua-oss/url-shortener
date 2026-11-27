import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options.js';

/** Applies every pending migration and returns the names of those it ran. */
export async function runPendingMigrations(
  databaseUrl: string,
): Promise<string[]> {
  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();
  try {
    const executed = await dataSource.runMigrations({ transaction: 'all' });
    return executed.map((migration) => migration.name);
  } finally {
    await dataSource.destroy();
  }
}

import { envSchema } from '../config/env.schema.js';
import { runPendingMigrations } from './migrate.js';

/** Entry point of the migration step: `node dist/database/run-migrations.js`. */
const { DATABASE_URL } = envSchema
  .pick({ DATABASE_URL: true })
  .parse(process.env);

const executed = await runPendingMigrations(DATABASE_URL);

console.log(
  executed.length === 0
    ? 'Database schema is up to date'
    : `Applied migrations: ${executed.join(', ')}`,
);

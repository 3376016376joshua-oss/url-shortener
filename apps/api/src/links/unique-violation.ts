import { QueryFailedError } from 'typeorm';

const UNIQUE_VIOLATION = '23505';

/** True when the error is Postgres refusing a duplicate under `constraint`. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as {
    code?: unknown;
    constraint?: unknown;
  };
  return (
    driverError.code === UNIQUE_VIOLATION &&
    driverError.constraint === constraint
  );
}

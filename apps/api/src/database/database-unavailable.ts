/** Node socket and DNS failures: the database could not be reached at all. */
const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
]);

/**
 * Postgres SQLSTATEs that mean "not now" rather than "bad query": the server
 * is shutting down or starting, is out of connections, or cancelled the
 * statement because it ran past the statement timeout.
 */
const UNAVAILABLE_SQL_STATES: ReadonlySet<string> = new Set([
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '57014',
]);
const CONNECTION_EXCEPTION_CLASS = '08';

/** node-postgres reports a dropped or timed-out connection without a code. */
const CONNECTION_LOST_MESSAGE =
  /connection terminated|timeout exceeded when trying to connect/i;

/** How far to follow wrapped errors (TypeORM wraps the driver's error). */
const MAX_CAUSE_DEPTH = 4;

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  driverError?: unknown;
  cause?: unknown;
  errors?: unknown;
};

function signalsUnavailability(error: ErrorLike): boolean {
  if (typeof error.code === 'string') {
    return (
      NETWORK_ERROR_CODES.has(error.code) ||
      UNAVAILABLE_SQL_STATES.has(error.code) ||
      error.code.startsWith(CONNECTION_EXCEPTION_CLASS)
    );
  }
  return (
    typeof error.message === 'string' &&
    CONNECTION_LOST_MESSAGE.test(error.message)
  );
}

/**
 * True when an error means Postgres could not answer, as opposed to the query
 * being wrong. Callers turn this into a 503 instead of a 500.
 */
export function isDatabaseUnavailable(
  error: unknown,
  depth = MAX_CAUSE_DEPTH,
): boolean {
  if (typeof error !== 'object' || error === null || depth === 0) {
    return false;
  }
  const candidate = error as ErrorLike;
  if (signalsUnavailability(candidate)) {
    return true;
  }
  const wrapped = [candidate.driverError, candidate.cause];
  if (Array.isArray(candidate.errors)) {
    wrapped.push(...(candidate.errors as unknown[]));
  }
  return wrapped.some((inner) => isDatabaseUnavailable(inner, depth - 1));
}

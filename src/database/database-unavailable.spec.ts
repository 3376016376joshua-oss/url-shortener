import { describe, expect, it } from 'vitest';
import { isDatabaseUnavailable } from './database-unavailable.js';

const withCode = (code: string, message = 'failure'): Error =>
  Object.assign(new Error(message), { code });

describe('isDatabaseUnavailable', () => {
  it.each([
    ['a refused connection', 'ECONNREFUSED'],
    ['an unresolvable host', 'ENOTFOUND'],
    ['a reset connection', 'ECONNRESET'],
    ['a server that is shutting down', '57P01'],
    ['a server that is still starting', '57P03'],
    ['a server out of connections', '53300'],
    ['a statement cancelled by the timeout', '57014'],
    ['a connection exception', '08006'],
  ])('recognises %s', (_reason, code) => {
    expect(isDatabaseUnavailable(withCode(code))).toBe(true);
  });

  it.each([
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'timeout exceeded when trying to connect',
  ])('recognises the driver message "%s"', (message) => {
    expect(isDatabaseUnavailable(new Error(message))).toBe(true);
  });

  it('looks inside the error TypeORM wraps around the driver error', () => {
    const queryFailed = Object.assign(new Error('query failed'), {
      driverError: withCode('57014'),
    });

    expect(isDatabaseUnavailable(queryFailed)).toBe(true);
  });

  it('looks inside the causes of a multi-address connection failure', () => {
    const refused = new AggregateError([withCode('ECONNREFUSED')], '');

    expect(isDatabaseUnavailable(refused)).toBe(true);
  });

  it.each([
    ['a unique violation', withCode('23505')],
    ['a check violation', withCode('23514')],
    ['a syntax error', withCode('42601')],
    ['an ordinary error', new Error('boom')],
    ['a non-error value', 'ECONNREFUSED'],
    ['nothing', undefined],
  ])('does not mistake %s for an outage', (_reason, error) => {
    expect(isDatabaseUnavailable(error)).toBe(false);
  });

  it('stops following a chain of causes that never ends', () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;

    expect(isDatabaseUnavailable(loop)).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { SingleFlight } from './single-flight.js';

describe('SingleFlight', () => {
  it('shares one load between callers that ask while it is in progress', async () => {
    const flights = new SingleFlight<string>();
    let finish: (value: string) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );

    const first = flights.run('a', load);
    const second = flights.run('a', load);
    finish('row');

    expect(await Promise.all([first, second])).toEqual(['row', 'row']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads separately for different keys', async () => {
    const flights = new SingleFlight<string>();
    const load = vi.fn((): Promise<string> => Promise.resolve('row'));

    await Promise.all([flights.run('a', load), flights.run('b', load)]);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('loads again once the previous load has settled', async () => {
    const flights = new SingleFlight<number>();
    let calls = 0;
    const load = (): Promise<number> => Promise.resolve((calls += 1));

    expect(await flights.run('a', load)).toBe(1);
    expect(await flights.run('a', load)).toBe(2);
  });

  it('gives every waiting caller the failure, and does not remember it', async () => {
    const flights = new SingleFlight<string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('database is down'))
      .mockResolvedValue('row');

    const first = flights.run('a', load);
    const second = flights.run('a', load);

    await expect(first).rejects.toThrow('database is down');
    await expect(second).rejects.toThrow('database is down');
    expect(await flights.run('a', load)).toBe('row');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppLogger } from './app-logger.js';
import { runInRequestContext } from './request-context.js';

function captureStdout(): () => string[] {
  const lines: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return () => lines;
}

describe('AppLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one JSON record per line, with structured fields at the top level', () => {
    const lines = captureStdout();

    createAppLogger({ json: true }).log(
      'request completed',
      { status: 302, route: '/:code' },
      'Http',
    );

    const [line] = lines();
    expect(line?.endsWith('\n')).toBe(true);
    expect(line?.trimEnd()).not.toContain('\n');
    expect(JSON.parse(line ?? '')).toMatchObject({
      level: 'log',
      message: 'request completed',
      context: 'Http',
      status: 302,
      route: '/:code',
    });
  });

  it('adds the request id to every record written during a request', () => {
    const lines = captureStdout();
    const logger = createAppLogger({ json: true });

    runInRequestContext({ requestId: 'request-1' }, () => {
      logger.warn('first');
      logger.log('second');
    });

    expect(lines().map((line) => JSON.parse(line) as unknown)).toEqual([
      expect.objectContaining({ message: 'first', requestId: 'request-1' }),
      expect.objectContaining({ message: 'second', requestId: 'request-1' }),
    ]);
  });

  it('keeps the request id across asynchronous work', async () => {
    const lines = captureStdout();
    const logger = createAppLogger({ json: true });

    await runInRequestContext({ requestId: 'request-2' }, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      logger.log('after waiting');
    });

    expect(JSON.parse(lines()[0] ?? '')).toMatchObject({
      requestId: 'request-2',
    });
  });

  it('leaves the request id out of a record written outside a request', () => {
    const lines = captureStdout();

    createAppLogger({ json: true }).log('starting');

    expect(JSON.parse(lines()[0] ?? '')).not.toHaveProperty('requestId');
  });

  it('keeps two concurrent requests apart', async () => {
    const lines = captureStdout();
    const logger = createAppLogger({ json: true });
    const handle = (requestId: string) =>
      runInRequestContext({ requestId }, async () => {
        await new Promise((resolve) => setImmediate(resolve));
        logger.log(`handled ${requestId}`);
      });

    await Promise.all([handle('a'), handle('b')]);

    for (const line of lines()) {
      const record = JSON.parse(line) as { message: string; requestId: string };
      expect(record.message).toBe(`handled ${record.requestId}`);
    }
    expect(lines()).toHaveLength(2);
  });
});

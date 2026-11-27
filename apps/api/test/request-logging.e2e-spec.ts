import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { currentRequestId } from '../src/common/logging/request-context.js';
import { createTestApp } from './support/create-test-app.js';

interface LogRecord {
  level: 'log' | 'warn' | 'error';
  message: unknown;
  fields: Record<string, unknown>;
  /** The request id in force at the moment the record was written. */
  requestId: string | undefined;
}

/** Keeps what the application logs, with the request each line belongs to. */
class RecordingLogger implements LoggerService {
  readonly records: LogRecord[] = [];

  log(message: unknown, ...rest: unknown[]): void {
    this.keep('log', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.keep('warn', message, rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    this.keep('error', message, rest);
  }

  private keep(
    level: LogRecord['level'],
    message: unknown,
    rest: unknown[],
  ): void {
    const fields = rest.find(
      (value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null,
    );
    this.records.push({
      level,
      message,
      fields: fields ?? {},
      requestId: currentRequestId(),
    });
  }
}

describe('request logging', () => {
  let app: NestExpressApplication;
  const logger = new RecordingLogger();
  const completed = () =>
    logger.records.filter((record) => record.message === 'request completed');

  beforeAll(async () => {
    app = await createTestApp();
    app.useLogger(logger);
  });

  beforeEach(() => {
    logger.records.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs one record per request, with the request id', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/users/0198c0de-0000-7000-8000-000000000001/enable')
      .set('X-Request-Id', 'trace-me');

    expect(completed()).toEqual([
      {
        level: 'log',
        message: 'request completed',
        requestId: 'trace-me',
        fields: {
          method: 'POST',
          route: '/api/v1/admin/users/:userId/enable',
          path: '/api/v1/admin/users/0198c0de-0000-7000-8000-000000000001/enable',
          status: 401,
          durationMs: expect.any(Number) as number,
        },
      },
    ]);
  });

  it('logs neither the query string nor the client address', async () => {
    await request(app.getHttpServer())
      .get('/no/such/route?token=secret-token')
      .set('X-Forwarded-For', '203.0.113.7');

    const [record] = completed();
    expect(record?.fields.path).toBe('/no/such/route');
    const written = JSON.stringify(logger.records);
    expect(written).not.toContain('secret-token');
    expect(written).not.toContain('203.0.113.7');
    expect(written).not.toContain('127.0.0.1');
  });

  it('keeps the ids of consecutive requests apart', async () => {
    await request(app.getHttpServer())
      .get('/no/such/route')
      .set('X-Request-Id', 'first');
    await request(app.getHttpServer())
      .get('/nor/this/one')
      .set('X-Request-Id', 'second');

    expect(completed().map((record) => record.requestId)).toEqual([
      'first',
      'second',
    ]);
  });

  it('does not log health checks or metric scrapes', async () => {
    await request(app.getHttpServer()).get('/health');
    await request(app.getHttpServer()).get('/health/ready');
    await request(app.getHttpServer()).get('/metrics');

    expect(completed()).toEqual([]);
  });
});

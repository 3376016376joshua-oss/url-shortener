import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/create-test-app.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BODY_LIMIT_BYTES = 10 * 1024;

describe('HTTP layer', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('request id', () => {
    it('gives every response a generated X-Request-Id', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.headers['x-request-id']).toMatch(UUID);
    });

    it("echoes the caller's X-Request-Id", async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('X-Request-Id', 'trace-42.a_b');

      expect(response.headers['x-request-id']).toBe('trace-42.a_b');
    });

    it.each([
      ['longer than 64 characters', 'a'.repeat(65)],
      ['with characters that need escaping', 'id with "quotes"'],
    ])('replaces an X-Request-Id %s', async (_reason, presented) => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('X-Request-Id', presented);

      expect(response.headers['x-request-id']).toMatch(UUID);
    });
  });

  describe('errors', () => {
    it('answers an unknown route with the API error body', async () => {
      const response = await request(app.getHttpServer()).get('/no/such/route');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        code: 'NOT_FOUND',
        message: 'Cannot GET /no/such/route',
      });
    });

    it('answers malformed JSON with 400 VALIDATION_FAILED', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/urls')
        .set('Content-Type', 'application/json')
        .send('{"longUrl": ');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
      });
    });

    it('answers a body over 10 kB with 413 PAYLOAD_TOO_LARGE', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/urls')
        .send({ longUrl: 'a'.repeat(BODY_LIMIT_BYTES) });

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({
        statusCode: 413,
        error: 'Payload Too Large',
        code: 'PAYLOAD_TOO_LARGE',
      });
    });

    it('accepts a body just under the limit', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/urls')
        .send({ longUrl: 'a'.repeat(BODY_LIMIT_BYTES - 100) });

      expect(response.status).not.toBe(413);
    });

    it('traces a request that was rejected before reaching a route', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/urls')
        .set('Content-Type', 'application/json')
        .set('X-Request-Id', 'rejected-early')
        .send('{');

      expect(response.status).toBe(400);
      expect(response.headers['x-request-id']).toBe('rejected-early');
    });
  });
});

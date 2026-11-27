import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../../src/app.setup.js';
import { AuthGuard } from '../../src/identity/auth.guard.js';
import { CurrentPrincipal } from '../../src/identity/current-principal.decorator.js';
import type { Principal } from '../../src/identity/principal.js';
import {
  APP_ORIGIN,
  as,
  createAccount,
  createIdentityHarness,
  type Account,
  type IdentityHarness,
} from './identity-harness.js';

/**
 * A state-changing route that takes either credential, as the link routes of
 * another workstream do. It exists only to exercise authentication.
 */
@Controller('api/v1/probe')
@UseGuards(AuthGuard)
class ProbeController {
  @Post()
  @HttpCode(HttpStatus.OK)
  whoAmI(@CurrentPrincipal() principal: Principal): { kind: string } {
    return { kind: principal.kind };
  }
}

describe('cross-site request forgery and API keys (ID-2, AC-4)', () => {
  let harness: IdentityHarness;
  let owner: Account;
  let base: string;

  const createKey = (body: Record<string, unknown> = { name: 'CI' }) =>
    as(harness.app, owner.cookie).post(`${base}/api-keys`).send(body);
  const newKey = async (): Promise<{ id: string; key: string }> => {
    const response = await createKey().expect(201);
    return response.body as { id: string; key: string };
  };

  beforeAll(async () => {
    harness = await createIdentityHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    owner = await createAccount(harness);
    base = `/api/v1/workspaces/${owner.workspaceId}`;
  });

  afterAll(async () => {
    await harness.app.close();
  });

  describe('on a state-changing route that takes either credential', () => {
    let probeApp: NestExpressApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
        controllers: [ProbeController],
      }).compile();
      probeApp =
        moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
      configureApp(probeApp);
      await probeApp.init();
    });

    afterAll(async () => {
      await probeApp.close();
    });

    const probe = () => request(probeApp.getHttpServer()).post('/api/v1/probe');

    it('refuses the session cookie without a matching Origin', async () => {
      const noOrigin = await probe().set('Cookie', owner.cookie);
      const wrongOrigin = await probe()
        .set('Cookie', owner.cookie)
        .set('Origin', 'https://evil.example');

      for (const response of [noOrigin, wrongOrigin]) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
      }
    });

    it('accepts the session cookie with the app as Origin', async () => {
      const response = await probe()
        .set('Cookie', owner.cookie)
        .set('Origin', APP_ORIGIN);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ kind: 'session' });
    });

    it('accepts the same request with an API key and no Origin', async () => {
      const { key } = await newKey();

      const response = await probe().set('Authorization', `Bearer ${key}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ kind: 'api_key' });
    });
  });
});

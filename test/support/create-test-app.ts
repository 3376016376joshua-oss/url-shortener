import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { APP_OPTIONS, configureApp } from '../../src/app.setup.js';

type Customize = (builder: TestingModuleBuilder) => TestingModuleBuilder;

/**
 * Boots the whole application, configured exactly as in production, against
 * the test Postgres and Redis. Pass `customize` to override providers.
 * The caller owns the app and must `close()` it.
 */
export async function createTestApp(
  customize: Customize = (builder) => builder,
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await customize(builder).compile();
  const app =
    moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  configureApp(app);
  await app.init();
  return app;
}

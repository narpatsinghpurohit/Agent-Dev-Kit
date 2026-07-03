import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env.schema';
import { setupSwagger } from './openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);

  const config = app.get(ConfigService<Env, true>);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    // Swagger UI at /api/docs in dev; the committed openapi.json comes from
    // `pnpm --filter @repo/api emit-openapi`, not from this endpoint.
    setupSwagger(app);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();

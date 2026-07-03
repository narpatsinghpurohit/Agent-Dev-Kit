import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env.schema';

/**
 * Everything between NestFactory.create and listen — shared by main.ts and
 * the e2e tests so tests exercise the real middleware stack.
 */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  // Behind a reverse proxy in prod; needed for correct client IPs (throttling).
  (app as NestExpressApplication).set('trust proxy', 1);

  return app;
}

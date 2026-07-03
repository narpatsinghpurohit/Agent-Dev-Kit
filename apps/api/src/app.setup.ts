import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SettingsService } from './settings/settings.service';

/**
 * Everything between NestFactory.create and listen — shared by main.ts and
 * the e2e tests so tests exercise the real middleware stack.
 */
export function configureApp(app: INestApplication): INestApplication {
  const settings = app.get(SettingsService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    // Evaluated per request — admins can edit allowed origins at runtime.
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = settings.getGeneral().corsOrigins;
      if (!requestOrigin || allowed.includes(requestOrigin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });
  // Behind a reverse proxy in prod; needed for correct client IPs (throttling).
  (app as NestExpressApplication).set('trust proxy', 1);

  return app;
}

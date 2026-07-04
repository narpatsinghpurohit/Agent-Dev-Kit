import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AiModule } from './ai/ai.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { type Env, validateEnv } from './config/env.schema';
import { ConsultationsModule } from './consultations/consultations.module';
import { MailerModule } from './mailer/mailer.module';
import { PatientsModule } from './patients/patients.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('NODE_ENV', { infer: true }) === 'production' ? 'info' : 'debug',
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          // Query strings can carry PII (?search=<patient name>) — log paths only.
          serializers: {
            req(req: { url?: string }) {
              if (typeof req.url === 'string') req.url = req.url.split('?')[0] ?? req.url;
              return req;
            },
          },
        },
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        // The OpenAPI emit script boots the app without a database.
        lazyConnection: process.env.OPENAPI_EMIT === '1',
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        // e2e suites hammer auth endpoints far past the human limits.
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    SettingsModule,
    UsersModule,
    MailerModule,
    AuthModule,
    PatientsModule,
    ConsultationsModule,
    AiModule,
  ],
  providers: [
    // Order matters: throttling runs before auth so brute-force hits are
    // rejected without token verification work.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

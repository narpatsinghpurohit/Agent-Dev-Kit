import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../config/env.schema';
import { MailerModule } from '../mailer/mailer.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { GoogleTokenVerifier } from './google-token.verifier';
import { OneTimeToken, OneTimeTokenSchema } from './one-time-token.schema';
import { OneTimeTokensRepository } from './one-time-tokens.repository';
import {
  ConsumedRefreshToken,
  ConsumedRefreshTokenSchema,
  Session,
  SessionSchema,
} from './session.schema';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    MailerModule,
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: ConsumedRefreshToken.name, schema: ConsumedRefreshTokenSchema },
      { name: OneTimeToken.name, schema: OneTimeTokenSchema },
    ]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionsRepository,
    OneTimeTokensRepository,
    AuthGuard,
    GoogleTokenVerifier,
  ],
  exports: [TokenService, AuthGuard],
})
export class AuthModule {}

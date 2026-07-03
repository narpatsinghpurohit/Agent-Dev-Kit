import { hash, verify } from '@node-rs/argon2';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Types } from 'mongoose';
import type { AuthResponse, LoginInput, SignupInput } from '@repo/schemas';
import type { Env } from '../config/env.schema';
import { Mailer } from '../mailer/mailer.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { OneTimeTokensRepository } from './one-time-tokens.repository';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './token.service';

// OWASP-recommended argon2id parameters.
const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export interface IssuedTokens extends AuthResponse {
  /** Always present here; the controller decides cookie vs body transport. */
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly oneTimeTokensRepository: OneTimeTokensRepository,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService<Env, true>,
    private readonly settingsService: SettingsService,
    private readonly mailer: Mailer,
  ) {}

  async signup(input: SignupInput, userAgent?: string): Promise<IssuedTokens> {
    const passwordHash = await hash(input.password, ARGON2_OPTIONS);
    const user = await this.usersService.createUser({
      email: input.email,
      passwordHash,
      name: input.name,
    });
    await this.sendVerificationEmail(user._id, user.email);
    return this.issueTokens(user._id, userAgent);
  }

  async login(input: LoginInput, userAgent?: string): Promise<IssuedTokens> {
    const user = await this.usersService.findByEmail(input.email);
    // Verify against a constant dummy hash when the user is missing so
    // response timing does not reveal which emails exist.
    const passwordHash = user?.passwordHash ?? DUMMY_ARGON2_HASH;
    const valid = await verify(passwordHash, input.password).catch(() => false);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Runtime flag from the settings store (env value is only the seed).
    if (this.settingsService.getGeneral().requireEmailVerification && !user.emailVerified) {
      throw new UnauthorizedException('Email not verified — check your inbox');
    }
    return this.issueTokens(user._id, userAgent);
  }

  /**
   * Rotate the refresh token. A token consumed within the grace window
   * (multi-tab / flaky-network race) rotates again from the family head;
   * replaying ANY older consumed token is reuse — the whole family is
   * revoked on every device.
   */
  async refresh(presentedToken: string): Promise<IssuedTokens> {
    const tokenHash = this.tokenService.hashToken(presentedToken);
    const ttlDays = this.configService.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });

    const newToken = this.tokenService.generateOpaqueToken();
    let rotated = await this.sessionsRepository.rotateByCurrentHash(
      tokenHash,
      this.tokenService.hashToken(newToken),
      ttlDays,
    );

    if (!rotated) {
      const consumed = await this.sessionsRepository.findConsumed(tokenHash);
      if (!consumed) throw new UnauthorizedException('Invalid refresh token');

      const graceMs =
        this.configService.get('REFRESH_GRACE_WINDOW_SECONDS', { infer: true }) * 1000;
      if (Date.now() - consumed.rotatedAt.getTime() > graceMs) {
        this.logger.warn(`Refresh token reuse detected — revoking family ${consumed.familyId}`);
        await this.sessionsRepository.revokeFamily(consumed.familyId);
        throw new UnauthorizedException('Refresh token reuse detected');
      }

      const head = await this.sessionsRepository.findByFamilyId(consumed.familyId);
      if (!head) throw new UnauthorizedException('Invalid refresh token');
      rotated = await this.sessionsRepository.rotateByCurrentHash(
        head.currentTokenHash,
        this.tokenService.hashToken(newToken),
        ttlDays,
      );
      if (!rotated) throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(rotated.userId.toString());
    if (!user) throw new UnauthorizedException('Account no longer exists');

    return {
      accessToken: await this.tokenService.signAccessToken(user._id.toString()),
      refreshToken: newToken,
      user: this.usersService.toDto(user),
    };
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    await this.sessionsRepository.revokeByCurrentHash(this.tokenService.hashToken(presentedToken));
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return this.usersService.toDto(user);
  }

  /** Always succeeds from the caller's perspective — no account enumeration. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return;
    const token = this.tokenService.generateOpaqueToken();
    await this.oneTimeTokensRepository.issue(
      user._id,
      'reset-password',
      this.tokenService.hashToken(token),
    );
    await this.mailer.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Reset link token (1h): ${token}`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const consumed = await this.oneTimeTokensRepository.consume(
      'reset-password',
      this.tokenService.hashToken(token),
    );
    if (!consumed) throw new UnauthorizedException('Invalid or expired reset token');
    const passwordHash = await hash(newPassword, ARGON2_OPTIONS);
    await this.usersService.setPasswordHash(consumed.userId, passwordHash);
    // Credential change invalidates every session on every device.
    await this.sessionsRepository.revokeAllForUser(consumed.userId);
  }

  async verifyEmail(token: string): Promise<void> {
    const consumed = await this.oneTimeTokensRepository.consume(
      'verify-email',
      this.tokenService.hashToken(token),
    );
    if (!consumed) throw new UnauthorizedException('Invalid or expired verification token');
    await this.usersService.setEmailVerified(consumed.userId);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.emailVerified) return;
    await this.sendVerificationEmail(user._id, user.email);
  }

  private async sendVerificationEmail(userId: Types.ObjectId, email: string): Promise<void> {
    const token = this.tokenService.generateOpaqueToken();
    await this.oneTimeTokensRepository.issue(
      userId,
      'verify-email',
      this.tokenService.hashToken(token),
    );
    await this.mailer.send({
      to: email,
      subject: 'Verify your email',
      text: `Verification token (24h): ${token}`,
    });
  }

  private async issueTokens(userId: Types.ObjectId, userAgent?: string): Promise<IssuedTokens> {
    const refreshToken = this.tokenService.generateOpaqueToken();
    await this.sessionsRepository.createSession({
      userId,
      tokenHash: this.tokenService.hashToken(refreshToken),
      ttlDays: this.configService.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
      userAgent,
    });
    const user = await this.usersService.findById(userId.toString());
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return {
      accessToken: await this.tokenService.signAccessToken(userId.toString()),
      refreshToken,
      user: this.usersService.toDto(user),
    };
  }
}

// argon2id hash of a random unused password — for timing-safe login failures.
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHRzb21lc2FsdA$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

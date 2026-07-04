import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import type { AuthConfig, AuthResponse } from '@repo/schemas';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { Env } from '../config/env.schema';
import { SettingsService } from '../settings/settings.service';
import { AuthService, type IssuedTokens } from './auth.service';
import {
  AuthConfigDto,
  AuthResponseDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  RefreshRequestDto,
  ResendVerificationDto,
  ResetPasswordDto,
  SignupDto,
  UserDto,
  VerifyEmailDto,
} from './dto/auth.dto';

export const REFRESH_COOKIE = 'refresh_token';
// Must match the mounted route exactly (global prefix included) or the
// browser will not attach the cookie.
export const REFRESH_COOKIE_PATH = '/api/auth/refresh';

const AUTH_THROTTLE = { default: { limit: 50, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<Env, true>,
    private readonly settingsService: SettingsService,
  ) {}

  /** What the login screen may offer — safe to expose unauthenticated. */
  @Public()
  @Get('config')
  @ZodResponse({ status: 200, type: AuthConfigDto })
  authConfig(): AuthConfig {
    return { googleClientId: this.settingsService.getGeneral().googleClientId };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('signup')
  @ZodResponse({ status: 201, type: AuthResponseDto })
  async signup(
    @Body() body: SignupDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    const tokens = await this.authService.signup(body, userAgent);
    return this.deliverTokens(tokens, request, response);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: AuthResponseDto })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    const tokens = await this.authService.login(body, userAgent);
    return this.deliverTokens(tokens, request, response);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: AuthResponseDto })
  async googleLogin(
    @Body() body: GoogleLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    const tokens = await this.authService.googleLogin(body, userAgent);
    return this.deliverTokens(tokens, request, response);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: AuthResponseDto })
  async refresh(
    @Body() body: RefreshRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const presented = this.readRefreshToken(request) ?? body.refreshToken;
    if (!presented) {
      response.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    }
    const tokens = await this.authService.refresh(presented ?? '');
    return this.deliverTokens(tokens, request, response);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() body: RefreshRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.readRefreshToken(request) ?? body.refreshToken);
    response.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Get('me')
  @ZodResponse({ status: 200, type: UserDto })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(body.email);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body() body: VerifyEmailDto): Promise<void> {
    await this.authService.verifyEmail(body.token);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resendVerification(@Body() body: ResendVerificationDto): Promise<void> {
    await this.authService.resendVerification(body.email);
  }

  private readRefreshToken(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  /**
   * Transport policy: browsers get the refresh token as an httpOnly cookie
   * and never see it in the body; cookie-less clients (mobile) send
   * `x-refresh-transport: body` and get it in the JSON response instead.
   */
  private deliverTokens(tokens: IssuedTokens, request: Request, response: Response): AuthResponse {
    if (request.headers['x-refresh-transport'] === 'body') {
      return tokens;
    }

    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.configService.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge:
        this.configService.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000,
    });
    return { accessToken: tokens.accessToken, user: tokens.user };
  }
}

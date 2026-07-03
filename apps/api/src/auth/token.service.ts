import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.schema';

export interface AccessTokenPayload {
  sub: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  async signAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      {},
      {
        subject: userId,
        expiresIn: this.configService.get('ACCESS_TOKEN_TTL', { infer: true }),
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /** Opaque refresh / one-time tokens: 256 bits of entropy, base64url. */
  generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** High-entropy tokens are hashed with SHA-256 — argon2 is for passwords. */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

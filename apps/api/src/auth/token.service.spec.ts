import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'unit-test-secret-0123456789abcdefghij' })],
      providers: [
        TokenService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn(() => '15m') },
        },
      ],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  it('signs and verifies an access token round-trip', async () => {
    const token = await service.signAccessToken('user-123');
    const payload = await service.verifyAccessToken(token);
    expect(payload.sub).toBe('user-123');
  });

  it('rejects tampered tokens with 401', async () => {
    const token = await service.signAccessToken('user-123');
    await expect(service.verifyAccessToken(`${token}x`)).rejects.toThrow(UnauthorizedException);
  });

  it('generates unique high-entropy opaque tokens', () => {
    const a = service.generateOpaqueToken();
    const b = service.generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
  });

  it('hashes tokens deterministically with SHA-256', () => {
    expect(service.hashToken('abc')).toBe(service.hashToken('abc'));
    expect(service.hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

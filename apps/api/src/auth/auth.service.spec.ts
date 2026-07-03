import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mailer } from '../mailer/mailer.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { GoogleTokenVerifier } from './google-token.verifier';
import { OneTimeTokensRepository } from './one-time-tokens.repository';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './token.service';

const ENV: Record<string, unknown> = {
  REFRESH_TOKEN_TTL_DAYS: 30,
  REFRESH_GRACE_WINDOW_SECONDS: 45,
  REQUIRE_EMAIL_VERIFICATION: false,
};

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    email: 'ada@example.com',
    name: 'Ada',
    passwordHash: 'hash',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AuthService.refresh', () => {
  let service: AuthService;
  const sessions = {
    rotateByCurrentHash: vi.fn(),
    findConsumed: vi.fn(),
    findByFamilyId: vi.fn(),
    revokeFamily: vi.fn(),
    createSession: vi.fn(),
    revokeByCurrentHash: vi.fn(),
    revokeAllForUser: vi.fn(),
  };
  const users = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    createUser: vi.fn(),
    toDto: vi.fn().mockReturnValue({ id: 'u1' }),
    setEmailVerified: vi.fn(),
    setPasswordHash: vi.fn(),
  };
  const tokens = {
    hashToken: vi.fn((t: string) => `hash:${t}`),
    generateOpaqueToken: vi.fn(() => 'new-token'),
    signAccessToken: vi.fn(async () => 'access-token'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: SessionsRepository, useValue: sessions },
        { provide: OneTimeTokensRepository, useValue: { issue: vi.fn(), consume: vi.fn() } },
        { provide: TokenService, useValue: tokens },
        { provide: Mailer, useValue: { send: vi.fn() } },
        {
          provide: SettingsService,
          useValue: { getGeneral: () => ({ requireEmailVerification: false, corsOrigins: [] }) },
        },
        { provide: GoogleTokenVerifier, useValue: { verify: vi.fn() } },
        {
          provide: ConfigService,
          useValue: { get: vi.fn((key: string) => ENV[key]) },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  const baseSession = {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    familyId: 'family-1',
    currentTokenHash: 'hash:current',
    expiresAt: new Date(Date.now() + 1000_000),
    createdAt: new Date(),
  };

  it('rotates a valid current token', async () => {
    sessions.rotateByCurrentHash.mockResolvedValue({
      ...baseSession,
      currentTokenHash: 'hash:new-token',
    });
    users.findById.mockResolvedValue(makeUser());

    const result = await service.refresh('current');

    expect(sessions.rotateByCurrentHash).toHaveBeenCalledWith('hash:current', 'hash:new-token', 30);
    expect(result.refreshToken).toBe('new-token');
    expect(result.accessToken).toBe('access-token');
  });

  it('allows a just-consumed (grace window) token — multi-tab race', async () => {
    sessions.rotateByCurrentHash
      .mockResolvedValueOnce(null) // presented token is no longer the head
      .mockResolvedValueOnce({ ...baseSession, currentTokenHash: 'hash:new-token' });
    sessions.findConsumed.mockResolvedValue({
      tokenHash: 'hash:stale',
      familyId: 'family-1',
      userId: baseSession.userId,
      rotatedAt: new Date(Date.now() - 10_000), // 10s ago < 45s grace
    });
    sessions.findByFamilyId.mockResolvedValue(baseSession);
    users.findById.mockResolvedValue(makeUser());

    const result = await service.refresh('stale');
    expect(result.refreshToken).toBe('new-token');
    expect(sessions.revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes the whole family on reuse outside the grace window', async () => {
    sessions.rotateByCurrentHash.mockResolvedValue(null);
    sessions.findConsumed.mockResolvedValue({
      tokenHash: 'hash:stale',
      familyId: 'family-1',
      userId: baseSession.userId,
      rotatedAt: new Date(Date.now() - 120_000), // 2min ago > 45s grace
    });

    await expect(service.refresh('stale')).rejects.toThrow(UnauthorizedException);
    expect(sessions.revokeFamily).toHaveBeenCalledWith('family-1');
  });

  it('rejects unknown tokens without revealing anything', async () => {
    sessions.rotateByCurrentHash.mockResolvedValue(null);
    sessions.findConsumed.mockResolvedValue(null);
    await expect(service.refresh('bogus')).rejects.toThrow(UnauthorizedException);
    expect(sessions.revokeFamily).not.toHaveBeenCalled();
  });
});

describe('AuthService.login', () => {
  it('rejects with the same error for unknown email and wrong password', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: { findByEmail: vi.fn().mockResolvedValue(null) },
        },
        { provide: SessionsRepository, useValue: {} },
        { provide: OneTimeTokensRepository, useValue: {} },
        {
          provide: TokenService,
          useValue: { hashToken: vi.fn(), generateOpaqueToken: vi.fn(), signAccessToken: vi.fn() },
        },
        { provide: Mailer, useValue: { send: vi.fn() } },
        {
          provide: SettingsService,
          useValue: { getGeneral: () => ({ requireEmailVerification: false, corsOrigins: [] }) },
        },
        { provide: GoogleTokenVerifier, useValue: { verify: vi.fn() } },
        { provide: ConfigService, useValue: { get: vi.fn((key: string) => ENV[key]) } },
      ],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(service.login({ email: 'ghost@example.com', password: 'x' })).rejects.toThrow(
      'Invalid email or password',
    );
  });
});

describe('AuthService.googleLogin', () => {
  const verifier = { verify: vi.fn() };
  const settings = { getGeneral: vi.fn() };
  const sessions = { createSession: vi.fn(), revokeAllForUser: vi.fn() };
  const users = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByGoogleId: vi.fn(),
    createUser: vi.fn(),
    linkGoogleAccount: vi.fn(),
    toDto: vi.fn().mockReturnValue({ id: 'u1' }),
  };
  let service: AuthService;

  const profile = {
    sub: 'google-sub-1',
    email: 'ada@example.com',
    emailVerified: true,
    name: 'Ada',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    settings.getGeneral.mockReturnValue({
      requireEmailVerification: false,
      corsOrigins: [],
      googleClientId: 'client-id.apps.googleusercontent.com',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: SessionsRepository, useValue: sessions },
        { provide: OneTimeTokensRepository, useValue: {} },
        {
          provide: TokenService,
          useValue: {
            hashToken: vi.fn((t: string) => `hash:${t}`),
            generateOpaqueToken: vi.fn(() => 'refresh'),
            signAccessToken: vi.fn(async () => 'access'),
          },
        },
        { provide: Mailer, useValue: { send: vi.fn() } },
        { provide: SettingsService, useValue: settings },
        { provide: GoogleTokenVerifier, useValue: verifier },
        { provide: ConfigService, useValue: { get: vi.fn((key: string) => ENV[key]) } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('fails generically when Google sign-in is not configured', async () => {
    settings.getGeneral.mockReturnValue({ googleClientId: null });
    await expect(service.googleLogin({ credential: 'x'.repeat(30) })).rejects.toThrow(
      'Google sign-in failed',
    );
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('rejects unverified Google emails without creating anything', async () => {
    verifier.verify.mockResolvedValue({ ...profile, emailVerified: false });
    await expect(service.googleLogin({ credential: 'x'.repeat(30) })).rejects.toThrow(
      'Google sign-in failed',
    );
    expect(users.createUser).not.toHaveBeenCalled();
    expect(users.linkGoogleAccount).not.toHaveBeenCalled();
  });

  it('creates a new account keyed on sub (default member role)', async () => {
    verifier.verify.mockResolvedValue(profile);
    users.findByGoogleId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(null);
    const created = makeUser({ googleId: profile.sub });
    users.createUser.mockResolvedValue(created);
    users.findById.mockResolvedValue(created);

    const result = await service.googleLogin({ credential: 'x'.repeat(30) });

    expect(users.createUser).toHaveBeenCalledWith({
      email: profile.email,
      name: 'Ada',
      googleId: profile.sub,
      emailVerified: true,
    });
    // No role in the payload — new Google users get the schema default (member).
    expect(users.createUser.mock.calls[0]?.[0]).not.toHaveProperty('role');
    expect(result.accessToken).toBe('access');
  });

  it('links a verified password account and revokes its pre-link sessions', async () => {
    verifier.verify.mockResolvedValue(profile);
    users.findByGoogleId.mockResolvedValue(null);
    const existing = makeUser({ emailVerified: true });
    users.findByEmail.mockResolvedValue(existing);
    users.findById.mockResolvedValue(existing);

    await service.googleLogin({ credential: 'x'.repeat(30) });

    expect(users.linkGoogleAccount).toHaveBeenCalledWith(existing._id, profile.sub);
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(existing._id);
  });

  it('refuses to link when OUR flow never verified the local email (pre-hijack defense)', async () => {
    verifier.verify.mockResolvedValue(profile);
    users.findByGoogleId.mockResolvedValue(null);
    users.findByEmail.mockResolvedValue(makeUser({ emailVerified: false }));

    await expect(service.googleLogin({ credential: 'x'.repeat(30) })).rejects.toThrow(
      'Google sign-in failed',
    );
    expect(users.linkGoogleAccount).not.toHaveBeenCalled();
  });
});

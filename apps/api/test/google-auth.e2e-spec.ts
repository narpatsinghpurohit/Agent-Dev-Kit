import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GoogleTokenVerifier, type GoogleProfile } from '../src/auth/google-token.verifier';
import { createTestApp } from './create-test-app';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

/**
 * Google sign-in: the verifier is faked (credential string → profile) so the
 * suite stays keyless; everything downstream — account creation, sub-keyed
 * lookup, linking policy, generic failures — is the real code path.
 */
describe('google auth (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  const profiles = new Map<string, GoogleProfile>();
  const fakeVerifier = {
    verify: vi.fn(async (credential: string, audience: string) => {
      if (audience !== CLIENT_ID) return null;
      return profiles.get(credential) ?? null;
    }),
  };

  const credential = (key: string) => key.padEnd(24, '-'); // schema min length

  beforeAll(async () => {
    profiles.set(credential('ada'), {
      sub: 'google-sub-ada',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
    });
    profiles.set(credential('unverified'), {
      sub: 'google-sub-mallory',
      email: 'mallory@example.com',
      emailVerified: false,
      name: 'Mallory',
    });
    profiles.set(credential('linker'), {
      sub: 'google-sub-grace',
      email: 'grace@example.com',
      emailVerified: true,
      name: 'Grace Hopper',
    });

    app = await createTestApp('google-auth-e2e', {
      env: { GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID },
      configure: (builder) => builder.overrideProvider(GoogleTokenVerifier).useValue(fakeVerifier),
    });
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes the client ID through the public auth config', async () => {
    const res = await request(server).get('/api/auth/config').expect(200);
    expect(res.body).toEqual({ googleClientId: CLIENT_ID });
  });

  it('creates a member account for a first-time Google user — no admin access', async () => {
    const res = await request(server)
      .post('/api/auth/google')
      .send({ credential: credential('ada') })
      .expect(200);

    expect(res.body.user).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      role: 'member',
      emailVerified: true,
    });
    expect(res.body.accessToken).toBeTruthy();
    // Browser transport: refresh token arrives as an httpOnly cookie only.
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.headers['set-cookie']?.[0]).toContain('refresh_token=');

    // The verifier received the runtime-configured audience.
    expect(fakeVerifier.verify).toHaveBeenCalledWith(credential('ada'), CLIENT_ID);

    // "Internal features" stay closed: a Google member cannot reach settings.
    await request(server)
      .get('/api/settings')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(403);
  });

  it('returns the SAME account on repeat sign-in (keyed on sub, no duplicates)', async () => {
    const first = await request(server)
      .post('/api/auth/google')
      .send({ credential: credential('ada') })
      .expect(200);
    const second = await request(server)
      .post('/api/auth/google')
      .send({ credential: credential('ada') })
      .expect(200);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('fails generically for bogus credentials and unverified emails', async () => {
    const bogus = await request(server)
      .post('/api/auth/google')
      .send({ credential: credential('nonsense') })
      .expect(401);
    const unverified = await request(server)
      .post('/api/auth/google')
      .send({ credential: credential('unverified') })
      .expect(401);
    // One message for every failure class — no oracle.
    expect(bogus.body.message).toBe('Google sign-in failed');
    expect(unverified.body.message).toBe(bogus.body.message);
  });

  it('links to a password account only after OUR email verification, revoking old sessions', async () => {
    // A password account exists for grace@example.com, email NOT yet verified.
    const signup = await request(server)
      .post('/api/auth/signup')
      .send({ email: 'grace@example.com', password: 'longenough-pass', name: 'Grace' })
      .expect(201);
    const passwordCookie = signup.headers['set-cookie']?.[0] ?? '';

    // Unverified local email → no link, generic failure (pre-hijack defense).
    await request(server)
      .post('/api/auth/google')
      .send({ credential: credential('linker') })
      .expect(401);

    // Our own flow verifies the email (test shortcut: flip the flag directly).
    const { getModelToken } = await import('@nestjs/mongoose');
    const userModel = app.get<{
      updateOne: (f: unknown, u: unknown) => { exec: () => Promise<unknown> };
    }>(getModelToken('User'));
    await userModel
      .updateOne({ email: 'grace@example.com' }, { $set: { emailVerified: true } })
      .exec();

    // Now the link succeeds — same account, not a duplicate.
    const linked = await request(server)
      .post('/api/auth/google')
      .send({ credential: credential('linker') })
      .expect(200);
    expect(linked.body.user.id).toBe(signup.body.user.id);

    // Linking is a credential change: the pre-link refresh session is dead.
    await request(server).post('/api/auth/refresh').set('Cookie', passwordCookie).expect(401);
  });
});

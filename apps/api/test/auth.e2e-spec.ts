import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

const ada = { email: 'ada@example.com', password: 'correct-horse-battery', name: 'Ada' };

describe('auth (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    app = await createTestApp('auth-e2e');
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('signup + me', () => {
    it('signs up, sets the refresh cookie, and never leaks the token in the body', async () => {
      const res = await request(server).post('/api/auth/signup').send(ada).expect(201);

      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeUndefined();
      expect(res.body.user).toMatchObject({ email: ada.email, name: 'Ada', emailVerified: false });
      expect(res.body.user).not.toHaveProperty('passwordHash');

      const cookies = res.headers['set-cookie'] ?? [];
      const refreshCookie = [cookies].flat().find((c: string) => c.startsWith('refresh_token='));
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('Path=/api/auth/refresh');
      expect(refreshCookie).toContain('SameSite=Strict');
    });

    it('rejects duplicate emails with 409', async () => {
      await request(server).post('/api/auth/signup').send(ada).expect(409);
    });

    it('rejects invalid bodies with the error envelope', async () => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ email: 'not-an-email', password: 'x', name: '' })
        .expect(400);
      expect(res.body.message).toBe('Validation failed');
      expect(res.body.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(['email', 'password', 'name']),
      );
    });

    it('serves /me with a valid access token and 401 without', async () => {
      const login = await request(server)
        .post('/api/auth/login')
        .send({ email: ada.email, password: ada.password })
        .expect(200);

      const me = await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
      expect(me.body.email).toBe(ada.email);

      await request(server).get('/api/auth/me').expect(401);
      await request(server).get('/api/auth/me').set('Authorization', 'Bearer garbage').expect(401);
    });
  });

  describe('refresh rotation (body transport)', () => {
    async function loginBodyMode() {
      const res = await request(server)
        .post('/api/auth/login')
        .set('x-refresh-transport', 'body')
        .send({ email: ada.email, password: ada.password })
        .expect(200);
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.headers['set-cookie']).toBeUndefined();
      return res.body as { accessToken: string; refreshToken: string };
    }

    it('rotates the refresh token on every refresh', async () => {
      const first = await loginBodyMode();
      const second = await request(server)
        .post('/api/auth/refresh')
        .set('x-refresh-transport', 'body')
        .send({ refreshToken: first.refreshToken })
        .expect(200);

      expect(second.body.refreshToken).toBeTruthy();
      expect(second.body.refreshToken).not.toBe(first.refreshToken);
    });

    it('honors the grace window for a just-rotated token (multi-tab race)', async () => {
      const session = await loginBodyMode();
      const rotated = await request(server)
        .post('/api/auth/refresh')
        .set('x-refresh-transport', 'body')
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      // Presenting the immediately-stale token within the grace window works…
      const graced = await request(server)
        .post('/api/auth/refresh')
        .set('x-refresh-transport', 'body')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      expect(graced.body.refreshToken).not.toBe(rotated.body.refreshToken);
    });

    it('revokes the whole family when an old token is replayed after the grace window', async () => {
      const s1 = await loginBodyMode();
      const s2 = await request(server)
        .post('/api/auth/refresh')
        .set('x-refresh-transport', 'body')
        .send({ refreshToken: s1.refreshToken })
        .expect(200);
      const s3 = await request(server)
        .post('/api/auth/refresh')
        .set('x-refresh-transport', 'body')
        .send({ refreshToken: s2.body.refreshToken })
        .expect(200);

      // Simulate the grace window elapsing (no sleeps: backdate the history).
      const { getModelToken } = await import('@nestjs/mongoose');
      const consumedModel = app.get<{
        updateMany: (f: unknown, u: unknown) => { exec: () => Promise<unknown> };
      }>(getModelToken('ConsumedRefreshToken'));
      await consumedModel
        .updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 120_000) } })
        .exec();

      // s1's token is two rotations old and outside grace — nuke the family…
      await request(server)
        .post('/api/auth/refresh')
        .set('x-refresh-transport', 'body')
        .send({ refreshToken: s1.refreshToken })
        .expect(401);

      // …including the freshest token.
      await request(server)
        .post('/api/auth/refresh')
        .set('x-refresh-transport', 'body')
        .send({ refreshToken: s3.body.refreshToken })
        .expect(401);
    });
  });

  describe('refresh via cookie transport', () => {
    it('accepts the httpOnly cookie and re-sets it on rotation', async () => {
      const agent = request.agent(server);
      await agent
        .post('/api/auth/login')
        .send({ email: ada.email, password: ada.password })
        .expect(200);

      const refreshed = await agent.post('/api/auth/refresh').expect(200);
      expect(refreshed.body.accessToken).toBeTruthy();
      expect(refreshed.body.refreshToken).toBeUndefined();

      // Cookie was rotated — refreshing again still works via the agent jar.
      await agent.post('/api/auth/refresh').expect(200);
    });

    it('401s with no token at all', async () => {
      await request(server).post('/api/auth/refresh').send({}).expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the session so the refresh token stops working', async () => {
      const login = await request(server)
        .post('/api/auth/login')
        .set('x-refresh-transport', 'body')
        .send({ email: ada.email, password: ada.password })
        .expect(200);

      await request(server)
        .post('/api/auth/logout')
        .send({ refreshToken: login.body.refreshToken })
        .expect(204);

      await request(server)
        .post('/api/auth/refresh')
        .set('x-refresh-transport', 'body')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  describe('login hardening', () => {
    it('returns the same 401 for unknown email and wrong password', async () => {
      const unknown = await request(server)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'whatever-long' })
        .expect(401);
      const wrongPassword = await request(server)
        .post('/api/auth/login')
        .send({ email: ada.email, password: 'wrong-password' })
        .expect(401);
      expect(unknown.body.message).toBe(wrongPassword.body.message);
    });

    it('forgot-password returns 204 whether or not the account exists', async () => {
      await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: ada.email })
        .expect(204);
      await request(server)
        .post('/api/auth/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(204);
    });
  });
});

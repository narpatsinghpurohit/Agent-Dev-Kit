import type { INestApplication } from '@nestjs/common';
import { createConnection, type Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createTestApp } from './create-test-app';

const ADMIN = { email: 'boss@example.com', password: 'bootstrap-pass-123456' };
const DB = 'admin-bootstrap-e2e';

/**
 * Admin bootstrap, create path: on an empty database the platform admin is
 * created from ADMIN_EMAIL/ADMIN_PASSWORD at boot — no seeded demo user.
 * (The promotion path lives in admin-promotion.e2e-spec.ts: @nestjs/config
 * snapshots env at first module load, so each path needs its own process.)
 */
describe('admin bootstrap — create (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let mongo: Connection;

  const login = (email: string, password: string) =>
    request(server).post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    mongo = await createConnection(inject('mongoUri').replace('/?', `/${DB}?`)).asPromise();
    app = await createTestApp(DB, {
      env: { ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password },
    });
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await mongo.close();
  });

  it('creates the admin with real platform access', async () => {
    const res = await login(ADMIN.email, ADMIN.password).expect(200);
    expect(res.body.user).toMatchObject({ email: ADMIN.email, role: 'admin' });

    await request(server)
      .get('/api/settings')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('is idempotent — a second boot neither duplicates nor resets the account', async () => {
    const again = await createTestApp(DB, {
      env: { ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password },
    });
    await again.close();

    const count = await mongo.collection('users').countDocuments({ email: ADMIN.email });
    expect(count).toBe(1);
    await login(ADMIN.email, ADMIN.password).expect(200);
  });

  it('keeps signups as members — only the bootstrap account is admin', async () => {
    const res = await request(server)
      .post('/api/auth/signup')
      .send({ email: 'someone@example.com', password: 'longenough-pass', name: 'Someone' })
      .expect(201);
    expect(res.body.user.role).toBe('member');
    await request(server)
      .get('/api/settings')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(403);
  });
});

import { hash } from '@node-rs/argon2';
import type { INestApplication } from '@nestjs/common';
import { createConnection, type Connection } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createTestApp } from './create-test-app';

const ADMIN = { email: 'boss@example.com', password: 'bootstrap-pass-123456' };
const DB = 'admin-promotion-e2e';

/**
 * Admin bootstrap, promote path: when ADMIN_EMAIL already belongs to an
 * account, the boot promotes it WITHOUT touching its password — the env
 * password applies only at creation. The account is inserted straight into
 * Mongo before the first boot (config snapshots env at first module load).
 */
describe('admin bootstrap — promotion (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let mongo: Connection;

  const login = (email: string, password: string) =>
    request(server).post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    mongo = await createConnection(inject('mongoUri').replace('/?', `/${DB}?`)).asPromise();
    await mongo.collection('users').insertOne({
      email: ADMIN.email,
      name: 'Boss',
      passwordHash: await hash('original-owner-pass', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
      emailVerified: true,
      role: 'member',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    app = await createTestApp(DB, {
      env: { ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password },
    });
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await mongo.close();
  });

  it('promotes the existing account without touching its password', async () => {
    // The env bootstrap password does NOT apply to a pre-existing account…
    await login(ADMIN.email, ADMIN.password).expect(401);
    // …the owner's original password still works, and the role is now admin.
    const res = await login(ADMIN.email, 'original-owner-pass').expect(200);
    expect(res.body.user.role).toBe('admin');

    await request(server)
      .get('/api/settings')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);

    const count = await mongo.collection('users').countDocuments({ email: ADMIN.email });
    expect(count).toBe(1);
  });
});

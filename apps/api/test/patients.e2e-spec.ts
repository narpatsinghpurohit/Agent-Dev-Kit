import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

describe('patients (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    app = await createTestApp('patients-e2e');
    server = app.getHttpServer();

    const signup = async (email: string) => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ email, password: 'longenough-pass', name: email.split('@')[0] })
        .expect(201);
      return res.body.accessToken as string;
    };
    aliceToken = await signup('alice@example.com');
    bobToken = await signup('bob@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  const asAlice = () => `Bearer ${aliceToken}`;
  const asBob = () => `Bearer ${bobToken}`;
  const valid = { name: 'Asha Devi', age: 54, sex: 'female', language: 'hi-IN' };

  it('requires auth on every route', async () => {
    await request(server).get('/api/patients').expect(401);
    await request(server).post('/api/patients').send(valid).expect(401);
  });

  it('creates and returns the wire shape', async () => {
    const res = await request(server)
      .post('/api/patients')
      .set('Authorization', asAlice())
      .send({ ...valid, phone: '+91 98765 43210' })
      .expect(201);

    expect(res.body).toMatchObject({ name: 'Asha Devi', language: 'hi-IN', sex: 'female' });
    expect(res.body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(res.body).not.toHaveProperty('ownerId');
    expect(res.body).not.toHaveProperty('_id');
  });

  it('validates input (bad language, out-of-range age)', async () => {
    await request(server)
      .post('/api/patients')
      .set('Authorization', asAlice())
      .send({ ...valid, language: 'fr-FR' })
      .expect(400);
    await request(server)
      .post('/api/patients')
      .set('Authorization', asAlice())
      .send({ ...valid, age: 300 })
      .expect(400);
  });

  it('enforces ownership as 404, not 403', async () => {
    const created = await request(server)
      .post('/api/patients')
      .set('Authorization', asAlice())
      .send({ ...valid, name: 'Private Patient' })
      .expect(201);

    await request(server)
      .get(`/api/patients/${created.body.id}`)
      .set('Authorization', asBob())
      .expect(404);
    await request(server)
      .patch(`/api/patients/${created.body.id}`)
      .set('Authorization', asBob())
      .send({ age: 60 })
      .expect(404);
    await request(server)
      .delete(`/api/patients/${created.body.id}`)
      .set('Authorization', asBob())
      .expect(404);

    // Owner still sees it untouched.
    const mine = await request(server)
      .get(`/api/patients/${created.body.id}`)
      .set('Authorization', asAlice())
      .expect(200);
    expect(mine.body.age).toBe(54);
  });

  it('updates, clears optional fields with null, and deletes', async () => {
    const created = await request(server)
      .post('/api/patients')
      .set('Authorization', asAlice())
      .send({ ...valid, name: 'Mutate Me', notes: 'temp' })
      .expect(201);

    const updated = await request(server)
      .patch(`/api/patients/${created.body.id}`)
      .set('Authorization', asAlice())
      .send({ language: 'ta-IN', notes: null })
      .expect(200);
    expect(updated.body.language).toBe('ta-IN');
    expect(updated.body.notes).toBeUndefined();

    await request(server)
      .delete(`/api/patients/${created.body.id}`)
      .set('Authorization', asAlice())
      .expect(204);
    await request(server)
      .get(`/api/patients/${created.body.id}`)
      .set('Authorization', asAlice())
      .expect(404);
  });

  it('paginates with cursors and searches by name', async () => {
    const names = ['Anil One', 'Anil Two', 'Anil Three', 'Beena Four', 'Beena Five'];
    for (const name of names) {
      await request(server)
        .post('/api/patients')
        .set('Authorization', asBob())
        .send({ ...valid, name })
        .expect(201);
    }

    const page1 = await request(server)
      .get('/api/patients?limit=2')
      .set('Authorization', asBob())
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    // Newest first.
    expect(page1.body.items[0].name).toBe('Beena Five');

    const page2 = await request(server)
      .get(`/api/patients?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Authorization', asBob())
      .expect(200);
    const seen = new Set(
      [...page1.body.items, ...page2.body.items].map((p: { id: string }) => p.id),
    );
    expect(seen.size).toBe(4);

    // Search matches case-insensitively, never crosses tenants, and is not
    // a regex injection vector.
    await request(server)
      .post('/api/patients')
      .set('Authorization', asAlice())
      .send({ ...valid, name: 'Anil From Alice' })
      .expect(201);
    const anils = await request(server)
      .get('/api/patients?search=anil')
      .set('Authorization', asBob())
      .expect(200);
    expect(anils.body.items).toHaveLength(3); // Alice's Anil is invisible to Bob
    const evil = await request(server)
      .get(`/api/patients?search=${encodeURIComponent('.*')}`)
      .set('Authorization', asBob())
      .expect(200);
    expect(evil.body.items).toHaveLength(0);
  });
});

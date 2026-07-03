import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

describe('tasks (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    app = await createTestApp('tasks-e2e');
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

  it('requires auth on every route', async () => {
    await request(server).get('/api/tasks').expect(401);
    await request(server).post('/api/tasks').send({ title: 'x' }).expect(401);
  });

  it('creates and returns the wire shape', async () => {
    const res = await request(server)
      .post('/api/tasks')
      .set('Authorization', asAlice())
      .send({ title: 'Ship the kit', description: 'v1' })
      .expect(201);

    expect(res.body).toMatchObject({ title: 'Ship the kit', status: 'todo' });
    expect(res.body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(res.body).not.toHaveProperty('ownerId');
    expect(res.body).not.toHaveProperty('_id');
  });

  it('validates input (past dueDate, empty title)', async () => {
    await request(server)
      .post('/api/tasks')
      .set('Authorization', asAlice())
      .send({ title: '' })
      .expect(400);
    await request(server)
      .post('/api/tasks')
      .set('Authorization', asAlice())
      .send({ title: 'x', dueDate: '2020-01-01T00:00:00.000Z' })
      .expect(400);
  });

  it('enforces ownership as 404, not 403', async () => {
    const created = await request(server)
      .post('/api/tasks')
      .set('Authorization', asAlice())
      .send({ title: 'private task' })
      .expect(201);

    await request(server)
      .get(`/api/tasks/${created.body.id}`)
      .set('Authorization', asBob())
      .expect(404);
    await request(server)
      .patch(`/api/tasks/${created.body.id}`)
      .set('Authorization', asBob())
      .send({ status: 'done' })
      .expect(404);
    await request(server)
      .delete(`/api/tasks/${created.body.id}`)
      .set('Authorization', asBob())
      .expect(404);

    // Owner still sees it untouched.
    const mine = await request(server)
      .get(`/api/tasks/${created.body.id}`)
      .set('Authorization', asAlice())
      .expect(200);
    expect(mine.body.status).toBe('todo');
  });

  it('updates, clears fields with null, and deletes', async () => {
    const created = await request(server)
      .post('/api/tasks')
      .set('Authorization', asAlice())
      .send({ title: 'mutate me', description: 'temp' })
      .expect(201);

    const updated = await request(server)
      .patch(`/api/tasks/${created.body.id}`)
      .set('Authorization', asAlice())
      .send({ status: 'in_progress', description: null })
      .expect(200);
    expect(updated.body.status).toBe('in_progress');
    expect(updated.body.description).toBeUndefined();

    await request(server)
      .delete(`/api/tasks/${created.body.id}`)
      .set('Authorization', asAlice())
      .expect(204);
    await request(server)
      .get(`/api/tasks/${created.body.id}`)
      .set('Authorization', asAlice())
      .expect(404);
  });

  it('paginates with cursors and filters by status', async () => {
    const titles = ['p1', 'p2', 'p3', 'p4', 'p5'];
    for (const title of titles) {
      await request(server)
        .post('/api/tasks')
        .set('Authorization', asBob())
        .send({ title })
        .expect(201);
    }

    const page1 = await request(server)
      .get('/api/tasks?limit=2')
      .set('Authorization', asBob())
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    // Newest first.
    expect(page1.body.items[0].title).toBe('p5');

    const page2 = await request(server)
      .get(`/api/tasks?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Authorization', asBob())
      .expect(200);
    expect(page2.body.items[0].title).toBe('p3');
    const seen = new Set(
      [...page1.body.items, ...page2.body.items].map((t: { id: string }) => t.id),
    );
    expect(seen.size).toBe(4);

    // Exhaust: last page has null cursor.
    const page3 = await request(server)
      .get(`/api/tasks?limit=2&cursor=${page2.body.nextCursor}`)
      .set('Authorization', asBob())
      .expect(200);
    expect(page3.body.nextCursor).toBeNull();

    // Status filter only returns matches.
    const first = page1.body.items[0];
    await request(server)
      .patch(`/api/tasks/${first.id}`)
      .set('Authorization', asBob())
      .send({ status: 'done' })
      .expect(200);
    const done = await request(server)
      .get('/api/tasks?status=done')
      .set('Authorization', asBob())
      .expect(200);
    expect(done.body.items).toHaveLength(1);
    expect(done.body.items[0].id).toBe(first.id);
  });

  it('rejects unknown query params types (limit over cap)', async () => {
    await request(server).get('/api/tasks?limit=101').set('Authorization', asAlice()).expect(400);
  });
});

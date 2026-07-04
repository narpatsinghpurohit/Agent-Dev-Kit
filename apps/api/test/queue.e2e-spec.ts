import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

describe('queue (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let aliceToken: string;
  let bobToken: string;
  let alicePatientId: string;

  beforeAll(async () => {
    app = await createTestApp('queue-e2e');
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

    const patient = await request(server)
      .post('/api/patients')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Asha Devi', age: 54, sex: 'female', language: 'hi-IN' })
      .expect(201);
    alicePatientId = patient.body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  const asAlice = () => `Bearer ${aliceToken}`;
  const asBob = () => `Bearer ${bobToken}`;
  /** Start of the current UTC day — the window GET /queue reads. */
  const utcDayStart = () => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  };

  it('requires auth on every route', async () => {
    await request(server).get('/api/queue').expect(401);
    await request(server)
      .post('/api/queue')
      .send({ patientId: alicePatientId, reason: 'Follow-up' })
      .expect(401);
  });

  it('creates an entry, denormalizing the patient name', async () => {
    const res = await request(server)
      .post('/api/queue')
      .set('Authorization', asAlice())
      .send({ patientId: alicePatientId, reason: 'Follow-up' })
      .expect(201);

    expect(res.body).toMatchObject({
      patientId: alicePatientId,
      patientName: 'Asha Devi',
      reason: 'Follow-up',
      status: 'waiting',
    });
    expect(res.body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(res.body.scheduledAt).toBeTruthy(); // defaults to "now"
    expect(res.body).not.toHaveProperty('ownerId');
    expect(res.body).not.toHaveProperty('_id');
  });

  it('rejects a foreign or unknown patient with 404', async () => {
    await request(server)
      .post('/api/queue')
      .set('Authorization', asBob())
      .send({ patientId: alicePatientId, reason: 'Sneaky booking' })
      .expect(404);
    await request(server)
      .post('/api/queue')
      .set('Authorization', asAlice())
      .send({ patientId: 'aaaaaaaaaaaaaaaaaaaaaaaa', reason: 'Ghost patient' })
      .expect(404);
  });

  it('validates input (missing reason)', async () => {
    await request(server)
      .post('/api/queue')
      .set('Authorization', asAlice())
      .send({ patientId: alicePatientId })
      .expect(400);
  });

  it("lists only today's entries, earliest first", async () => {
    const dayStart = utcDayStart();
    const at = (hoursFromDayStart: number) =>
      new Date(dayStart + hoursFromDayStart * 60 * 60 * 1000).toISOString();

    const bobPatient = await request(server)
      .post('/api/patients')
      .set('Authorization', asBob())
      .send({ name: 'Ravi Kumar', age: 41, sex: 'male', language: 'ta-IN' })
      .expect(201);
    const bobPatientId = bobPatient.body.id as string;

    const enqueue = async (reason: string, scheduledAt: string) =>
      request(server)
        .post('/api/queue')
        .set('Authorization', asBob())
        .send({ patientId: bobPatientId, reason, scheduledAt })
        .expect(201);

    await enqueue('Second today', at(10));
    await enqueue('First today', at(9));
    await enqueue('Yesterday', at(-1)); // previous UTC day — must not appear

    const res = await request(server).get('/api/queue').set('Authorization', asBob()).expect(200);

    const reasons = res.body.items.map((e: { reason: string }) => e.reason);
    expect(reasons).toEqual(['First today', 'Second today']);
    // Owner-scoped: none of Alice's entries leak into Bob's queue.
    expect(
      res.body.items.every((e: { patientName: string }) => e.patientName === 'Ravi Kumar'),
    ).toBe(true);
  });

  it('updates status and enforces ownership as 404, not 403', async () => {
    const created = await request(server)
      .post('/api/queue')
      .set('Authorization', asAlice())
      .send({ patientId: alicePatientId, reason: 'Review' })
      .expect(201);

    await request(server)
      .patch(`/api/queue/${created.body.id}`)
      .set('Authorization', asBob())
      .send({ status: 'active' })
      .expect(404);
    await request(server)
      .delete(`/api/queue/${created.body.id}`)
      .set('Authorization', asBob())
      .expect(404);

    const updated = await request(server)
      .patch(`/api/queue/${created.body.id}`)
      .set('Authorization', asAlice())
      .send({ status: 'active' })
      .expect(200);
    expect(updated.body.status).toBe('active');
    expect(updated.body.reason).toBe('Review'); // untouched fields survive
  });

  it('deletes an entry (204) and removes it from the list', async () => {
    const created = await request(server)
      .post('/api/queue')
      .set('Authorization', asAlice())
      .send({ patientId: alicePatientId, reason: 'Delete me' })
      .expect(201);

    await request(server)
      .delete(`/api/queue/${created.body.id}`)
      .set('Authorization', asAlice())
      .expect(204);
    await request(server)
      .delete(`/api/queue/${created.body.id}`)
      .set('Authorization', asAlice())
      .expect(404);

    const res = await request(server).get('/api/queue').set('Authorization', asAlice()).expect(200);
    const ids = res.body.items.map((e: { id: string }) => e.id);
    expect(ids).not.toContain(created.body.id);
  });
});

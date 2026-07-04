import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

/**
 * Vitals under a patient: create readings, list them newest-first with
 * server-derived trends, and the ownership-as-404 invariant.
 */
describe('vitals (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let doctorToken: string;
  let otherToken: string;
  let patientId: string;

  beforeAll(async () => {
    app = await createTestApp('vitals-e2e');
    server = app.getHttpServer();

    const signup = async (email: string) => {
      const res = await request(server)
        .post('/api/auth/signup')
        .send({ email, password: 'longenough-pass', name: email.split('@')[0] })
        .expect(201);
      return res.body.accessToken as string;
    };
    doctorToken = await signup('doctor@example.com');
    otherToken = await signup('other@example.com');

    const patient = await request(server)
      .post('/api/patients')
      .set('Authorization', asDoctor())
      .send({ name: 'Asha Devi', age: 54, sex: 'female', language: 'hi-IN' })
      .expect(201);
    patientId = patient.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const asDoctor = () => `Bearer ${doctorToken}`;
  const asOther = () => `Bearer ${otherToken}`;
  const vitalsPath = (id: string) => `/api/patients/${id}/vitals`;
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it('requires auth on every route', async () => {
    await request(server).get(vitalsPath(patientId)).expect(401);
    await request(server).post(vitalsPath(patientId)).send({ pulse: 80 }).expect(401);
  });

  it('rejects a reading with no measurement at all', async () => {
    await request(server)
      .post(vitalsPath(patientId))
      .set('Authorization', asDoctor())
      .send({ takenBy: 'doctor' })
      .expect(400);
    await request(server)
      .post(vitalsPath(patientId))
      .set('Authorization', asDoctor())
      .send({ systolic: null, diastolic: null, pulse: null, weightKg: null })
      .expect(400);
  });

  it('creates a reading and returns the wire shape', async () => {
    const res = await request(server)
      .post(vitalsPath(patientId))
      .set('Authorization', asDoctor())
      .send({ systolic: 138, diastolic: 88, weightKg: 75.5, takenAt: daysAgo(60) })
      .expect(201);

    expect(res.body).toMatchObject({
      patientId,
      systolic: 138,
      diastolic: 88,
      pulse: null,
      weightKg: 75.5,
      takenBy: 'compounder', // schema default
    });
    expect(res.body.id).toMatch(/^[0-9a-f]{24}$/);
    expect(res.body).not.toHaveProperty('ownerId');
    expect(res.body).not.toHaveProperty('_id');
  });

  it('lists newest-first and derives trends (rising bp, flat pulse, falling weight)', async () => {
    // The 60-days-ago reading (138/88, 75.5 kg) exists from the create test.
    await request(server)
      .post(vitalsPath(patientId))
      .set('Authorization', asDoctor())
      .send({ systolic: 145, diastolic: 90, pulse: 84, takenAt: daysAgo(30) })
      .expect(201);
    await request(server)
      .post(vitalsPath(patientId))
      .set('Authorization', asDoctor())
      .send({ systolic: 152, diastolic: 94, pulse: 80, weightKg: 74, takenAt: daysAgo(1) })
      .expect(201);

    const res = await request(server)
      .get(vitalsPath(patientId))
      .set('Authorization', asDoctor())
      .expect(200);

    expect(res.body.items).toHaveLength(3);
    expect(res.body.items.map((v: { systolic: number }) => v.systolic)).toEqual([152, 145, 138]);
    expect(res.body.trends).toEqual([
      { metric: 'bp', direction: 'up', label: '↑ 3 visits rising' },
      // Only two pulse readings, non-monotonic ordering is irrelevant: 84 → 80 falls.
      { metric: 'pulse', direction: 'down', label: '↓ 2 visits falling' },
      { metric: 'weight', direction: 'down', label: '↓ 1.5 kg / 2 mo' },
    ]);
  });

  it('enforces ownership as 404, not 403', async () => {
    await request(server).get(vitalsPath(patientId)).set('Authorization', asOther()).expect(404);
    await request(server)
      .post(vitalsPath(patientId))
      .set('Authorization', asOther())
      .send({ pulse: 80 })
      .expect(404);
    // Unknown and malformed patient ids are indistinguishable from foreign ones.
    await request(server)
      .get(vitalsPath('0123456789abcdef01234567'))
      .set('Authorization', asDoctor())
      .expect(404);
    await request(server)
      .get(vitalsPath('not-an-object-id'))
      .set('Authorization', asDoctor())
      .expect(404);
  });
});

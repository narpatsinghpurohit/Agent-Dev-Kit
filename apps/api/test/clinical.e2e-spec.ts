import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

describe('patient clinical profile (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let aliceToken: string;
  let bobToken: string;
  let patientId: string;
  let patientUpdatedAt: string;

  beforeAll(async () => {
    app = await createTestApp('clinical-e2e');
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

    const created = await request(server)
      .post('/api/patients')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Asha Devi', age: 54, sex: 'female', language: 'hi-IN' })
      .expect(201);
    patientId = created.body.id;
    patientUpdatedAt = created.body.updatedAt;
  });

  afterAll(async () => {
    await app.close();
  });

  const asAlice = () => `Bearer ${aliceToken}`;
  const asBob = () => `Bearer ${bobToken}`;
  const profile = {
    prakriti: 'vata-kapha',
    conditions: ['Hypertension', 'Obesity'],
    regimen: [
      { name: 'Sarpagandha vati', dose: '1', schedule: 'BD' },
      { name: 'Anulom-Vilom', schedule: 'daily' },
    ],
  };

  it('requires auth on both routes', async () => {
    await request(server).get(`/api/patients/${patientId}/clinical`).expect(401);
    await request(server).put(`/api/patients/${patientId}/clinical`).send(profile).expect(401);
  });

  it('returns the default-empty profile before anything is stored', async () => {
    const res = await request(server)
      .get(`/api/patients/${patientId}/clinical`)
      .set('Authorization', asAlice())
      .expect(200);

    expect(res.body).toEqual({
      prakriti: null,
      conditions: [],
      regimen: [],
      // Never-written profiles report the patient's own timestamp.
      updatedAt: patientUpdatedAt,
    });
  });

  it('put/get roundtrip persists the profile with its own timestamp', async () => {
    const put = await request(server)
      .put(`/api/patients/${patientId}/clinical`)
      .set('Authorization', asAlice())
      .send(profile)
      .expect(200);
    expect(put.body).toMatchObject(profile);
    expect(put.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const got = await request(server)
      .get(`/api/patients/${patientId}/clinical`)
      .set('Authorization', asAlice())
      .expect(200);
    expect(got.body).toEqual(put.body);

    // The existing patient wire shape is untouched — no `clinical` key.
    const patient = await request(server)
      .get(`/api/patients/${patientId}`)
      .set('Authorization', asAlice())
      .expect(200);
    expect(patient.body).not.toHaveProperty('clinical');
  });

  it('enforces ownership as 404, not 403', async () => {
    await request(server)
      .get(`/api/patients/${patientId}/clinical`)
      .set('Authorization', asBob())
      .expect(404);
    await request(server)
      .put(`/api/patients/${patientId}/clinical`)
      .set('Authorization', asBob())
      .send({ ...profile, conditions: ['Hijacked'] })
      .expect(404);

    // Owner still sees the profile untouched.
    const mine = await request(server)
      .get(`/api/patients/${patientId}/clinical`)
      .set('Authorization', asAlice())
      .expect(200);
    expect(mine.body.conditions).toEqual(['Hypertension', 'Obesity']);
  });

  it('rejects an unknown prakriti as 400', async () => {
    await request(server)
      .put(`/api/patients/${patientId}/clinical`)
      .set('Authorization', asAlice())
      .send({ ...profile, prakriti: 'agni' })
      .expect(400);
  });
});

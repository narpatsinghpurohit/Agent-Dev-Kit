import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

/**
 * The cohort aggregation against REAL Mongo (the unit spec mocks
 * `aggregate`, so `$sort` + `$first`/`$last` semantics are only proven
 * here): a 6-patient similar panel where a known subset improved, with
 * vitals inserted NEWEST-FIRST so earliest/latest can only come out right
 * when the pipeline actually sorts by takenAt. The exact `COHORT:` line
 * must then be quoted verbatim by the mock treatment plan and insight.
 */
describe('cohort stats (e2e, real aggregation)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let doctorToken: string;
  let targetId: string;

  const asDoctor = () => `Bearer ${doctorToken}`;
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  async function createSimilarPatient(name: string): Promise<string> {
    const res = await request(server)
      .post('/api/patients')
      .set('Authorization', asDoctor())
      .send({ name, age: 50, sex: 'female', language: 'hi-IN' })
      .expect(201);
    await request(server)
      .put(`/api/patients/${res.body.id}/clinical`)
      .set('Authorization', asDoctor())
      .send({ prakriti: null, conditions: ['Hypertension'], regimen: [] })
      .expect(200);
    return res.body.id as string;
  }

  async function addVital(patientId: string, systolic: number, takenAt: string) {
    await request(server)
      .post(`/api/patients/${patientId}/vitals`)
      .set('Authorization', asDoctor())
      .send({ systolic, takenBy: 'doctor', takenAt })
      .expect(201);
  }

  beforeAll(async () => {
    app = await createTestApp('cohort-stats-e2e');
    server = app.getHttpServer();

    const signup = await request(server)
      .post('/api/auth/signup')
      .send({ email: 'cohort-doctor@example.com', password: 'longenough-pass', name: 'cohort' })
      .expect(201);
    doctorToken = signup.body.accessToken as string;

    // Target: 54F hypertensive — similar = female, age 44-64, shared condition.
    const target = await request(server)
      .post('/api/patients')
      .set('Authorization', asDoctor())
      .send({ name: 'Kamla Devi', age: 54, sex: 'female', language: 'hi-IN' })
      .expect(201);
    targetId = target.body.id;
    await request(server)
      .put(`/api/patients/${targetId}/clinical`)
      .set('Authorization', asDoctor())
      .send({ prakriti: null, conditions: ['Hypertension'], regimen: [] })
      .expect(200);

    // 6 similar patients: 3 improved (latest systolic < earliest), 2
    // worsened, 1 without any readings → improvedPct = 3/6 = 50%.
    // Readings are POSTED newest-first — insertion order deliberately
    // contradicts chronology so only a correct $sort yields 50%. (A
    // reversed sort would report the worsened share, 33%.)
    const improvedLatest: Array<[number, number]> = [
      [150, 138],
      [148, 140],
      [145, 132],
    ];
    for (const [i, [earliest, latest]] of improvedLatest.entries()) {
      const id = await createSimilarPatient(`Improved ${i}`);
      await addVital(id, latest, daysAgo(1));
      await addVital(id, earliest, daysAgo(60));
    }
    const worsened: Array<[number, number]> = [
      [130, 141],
      [128, 139],
    ];
    for (const [i, [earliest, latest]] of worsened.entries()) {
      const id = await createSimilarPatient(`Worsened ${i}`);
      await addVital(id, latest, daysAgo(1));
      await addVital(id, earliest, daysAgo(60));
    }
    await createSimilarPatient('No Readings');
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('quotes the exact cohort line in the insight and treatment plan (mock provider)', async () => {
    const started = await request(server)
      .post('/api/consultations')
      .set('Authorization', asDoctor())
      .send({ patientId: targetId, doctorLanguage: 'en-IN' })
      .expect(201);
    const id = started.body.id as string;

    await request(server)
      .post(`/api/consultations/${id}/ask`)
      .set('Authorization', asDoctor())
      .send({ text: 'What brings you in?' })
      .expect(200);
    await request(server)
      .post(`/api/consultations/${id}/answer-text`)
      .set('Authorization', asDoctor())
      .send({ text: 'Fever for two days.' })
      .expect(200);

    const cohortLine = 'COHORT: 50% of 6 similar patients improved systolic control';

    // The private insight cites the real percentage while in progress.
    const insight = await request(server)
      .post(`/api/consultations/${id}/insight`)
      .set('Authorization', asDoctor())
      .expect(200);
    expect(insight.body.turns.at(-1).sourceText).toContain(cohortLine);

    await request(server)
      .post(`/api/consultations/${id}/finish`)
      .set('Authorization', asDoctor())
      .expect(200);

    const generated = await request(server)
      .post(`/api/consultations/${id}/treatment-plan`)
      .set('Authorization', asDoctor())
      .expect(200);
    const plan = generated.body.treatmentPlan;
    expect(plan.cohortSize).toBe(6);
    expect(plan.items).toHaveLength(3);
    for (const item of plan.items) {
      // Evidence echoes the aggregation verbatim — never an invented number.
      expect(item.evidence).toBe(cohortLine);
    }
  });
});
